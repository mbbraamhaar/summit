import { NextResponse } from 'next/server'
import {
  createMollieSubscription,
  getMolliePayment,
  isMollieApiError,
  type MolliePayment,
} from '@/lib/mollie'
import { createAdminClient } from '@/lib/supabase/admin'
import { type Json } from '@/types/database'

export const runtime = 'nodejs'

const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'expired', 'canceled'])
const TERMINAL_SUCCESS_STATUS = 'paid'

type SequenceType = 'first' | 'recurring'

type PaymentMetadata = {
  companyId: string | null
  subscriptionId: string | null
  planId: string | null
  interval: string | null
}

type ActivationRpcResult = 'activated' | 'already_active' | 'already_linked' | 'not_found'
type RecurringRpcResult =
  | 'extended'
  | 'past_due_set'
  | 'suspended'
  | 'recovered'
  | 'already_processed'
  | 'not_found'

function toStringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function mapSequenceType(value: string | undefined): SequenceType {
  return value === 'recurring' ? 'recurring' : 'first'
}

function parseAmountValue(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addBillingInterval(start: Date, interval: string) {
  const end = new Date(start)
  if (interval === 'year') {
    end.setUTCFullYear(end.getUTCFullYear() + 1)
    return end
  }

  end.setUTCMonth(end.getUTCMonth() + 1)
  return end
}

function mapPlanIntervalToMollie(interval: string) {
  return interval === 'year' ? '12 months' : '1 month'
}

function parseIsoTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === '23505'
}

function parsePaymentMetadata(payment: MolliePayment): PaymentMetadata {
  const metadata = payment.metadata && typeof payment.metadata === 'object'
    ? payment.metadata
    : {}

  return {
    companyId: toStringValue(metadata.companyId) ?? toStringValue(metadata.company_id),
    subscriptionId: toStringValue(metadata.subscriptionId) ?? toStringValue(metadata.subscription_id),
    planId: toStringValue(metadata.planId) ?? toStringValue(metadata.plan_id),
    interval: toStringValue(metadata.interval),
  }
}

async function extractPaymentIdFromRequest(request: Request, url: URL) {
  const rawBody = (await request.text()).trim()
  const queryPaymentId = toStringValue(url.searchParams.get('id'))

  if (rawBody) {
    const params = new URLSearchParams(rawBody)
    const formPaymentId = toStringValue(params.get('id'))
    if (formPaymentId) {
      return formPaymentId
    }

    try {
      const json = JSON.parse(rawBody) as unknown
      if (json && typeof json === 'object' && 'id' in json) {
        const candidate = (json as { id?: unknown }).id
        const jsonPaymentId = toStringValue(candidate)
        if (jsonPaymentId) {
          return jsonPaymentId
        }
      }
    } catch {
      // Ignore and continue.
    }

    if (rawBody.startsWith('tr_')) {
      return rawBody
    }
  }

  return queryPaymentId
}

async function getWebhookSubscription(
  admin: ReturnType<typeof createAdminClient>,
  lookup: { subscriptionId: string | null; companyId: string | null },
) {
  if (lookup.subscriptionId) {
    const { data: byId, error: byIdError } = await admin
      .from('subscriptions')
      .select('id, company_id, plan_id, status, mollie_subscription_id, mollie_customer_id, current_period_start, current_period_end')
      .eq('id', lookup.subscriptionId)
      .maybeSingle()

    if (byIdError) {
      throw new Error(byIdError.message)
    }

    if (byId) {
      return byId
    }
  }

  if (!lookup.companyId) {
    return null
  }

  const { data: byCompany, error: byCompanyError } = await admin
    .from('subscriptions')
    .select('id, company_id, plan_id, status, mollie_subscription_id, mollie_customer_id, current_period_start, current_period_end')
    .eq('company_id', lookup.companyId)
    .maybeSingle()

  if (byCompanyError) {
    throw new Error(byCompanyError.message)
  }

  return byCompany
}

function isTerminalStatus(status: string) {
  return status === TERMINAL_SUCCESS_STATUS || TERMINAL_FAILURE_STATUSES.has(status)
}

export async function POST(request: Request) {
  const expectedSecret = process.env.MOLLIE_WEBHOOK_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!expectedSecret || !appUrl) {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const receivedSecret = url.searchParams.get('secret')
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const paymentId = await extractPaymentIdFromRequest(request, url)
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  console.info('mollie_webhook_received', { paymentId })

  let payment: MolliePayment
  try {
    payment = await getMolliePayment(paymentId)
  } catch (error) {
    console.error('mollie_webhook_payment_fetch_failed', {
      paymentId,
      error: isMollieApiError(error) ? error.message : 'Failed to load payment from Mollie',
    })
    return NextResponse.json(
      { error: isMollieApiError(error) ? error.message : 'Failed to load payment from Mollie' },
      { status: 500 },
    )
  }

  console.info('mollie_webhook_payment_status_fetched', {
    paymentId: payment.id,
    paymentStatus: payment.status,
    sequenceType: payment.sequenceType ?? 'first',
  })

  const metadata = parsePaymentMetadata(payment)
  const admin = createAdminClient()

  const { data: existingAttempt, error: existingAttemptError } = await admin
    .from('subscription_payment_attempts')
    .select('id, company_id, subscription_id, plan_id, sequence_type')
    .eq('mollie_payment_id', payment.id)
    .maybeSingle()

  if (existingAttemptError) {
    return NextResponse.json({ error: existingAttemptError.message }, { status: 500 })
  }

  let paymentAttempt = existingAttempt
  const sequenceType = paymentAttempt?.sequence_type ?? mapSequenceType(payment.sequenceType)

  if (paymentAttempt) {
    const { error: updateAttemptError } = await admin
      .from('subscription_payment_attempts')
      .update({
        status: payment.status,
        raw: payment as unknown as Json,
        subscription_id: paymentAttempt.subscription_id ?? metadata.subscriptionId,
      })
      .eq('id', paymentAttempt.id)

    if (updateAttemptError) {
      return NextResponse.json({ error: updateAttemptError.message }, { status: 500 })
    }
  } else {
    if (!metadata.companyId || !metadata.planId) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const { error: insertAttemptError } = await admin
      .from('subscription_payment_attempts')
      .insert({
        company_id: metadata.companyId,
        subscription_id: metadata.subscriptionId,
        plan_id: metadata.planId,
        mollie_payment_id: payment.id,
        sequence_type: sequenceType,
        status: payment.status,
        amount: parseAmountValue(payment.amount?.value),
        currency: payment.amount?.currency || 'EUR',
        raw: payment as unknown as Json,
      })

    if (insertAttemptError) {
      if (!isUniqueViolation(insertAttemptError)) {
        return NextResponse.json({ error: insertAttemptError.message }, { status: 500 })
      }

      const { data: raceAttempt, error: raceAttemptError } = await admin
        .from('subscription_payment_attempts')
        .select('id, company_id, subscription_id, plan_id, sequence_type')
        .eq('mollie_payment_id', payment.id)
        .maybeSingle()

      if (raceAttemptError) {
        return NextResponse.json({ error: raceAttemptError.message }, { status: 500 })
      }

      paymentAttempt = raceAttempt
    }
  }

  if (!isTerminalStatus(payment.status)) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const subscription = await getWebhookSubscription(admin, {
    subscriptionId: paymentAttempt?.subscription_id ?? metadata.subscriptionId,
    companyId: paymentAttempt?.company_id ?? metadata.companyId,
  })

  if (sequenceType === 'first' && TERMINAL_FAILURE_STATUSES.has(payment.status)) {
    if (!subscription) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const { error: pendingError } = await admin
      .from('subscriptions')
      .update({
        status: 'pending',
      })
      .eq('id', subscription.id)

    if (pendingError) {
      return NextResponse.json({ error: pendingError.message }, { status: 500 })
    }

    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (sequenceType === 'recurring') {
    console.info('mollie_recurring_payment_received', {
      paymentId: payment.id,
      subscriptionId: metadata.subscriptionId ?? null,
      paymentStatus: payment.status,
    })

    if (!metadata.subscriptionId || !metadata.companyId) {
      console.info('mollie_recurring_payment_received', {
        paymentId: payment.id,
        subscriptionId: metadata.subscriptionId ?? null,
        reason: 'missing_metadata',
        hasSubscriptionId: Boolean(metadata.subscriptionId),
        hasCompanyId: Boolean(metadata.companyId),
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const { data: recurringSubscription, error: recurringSubscriptionError } = await admin
      .from('subscriptions')
      .select('id, company_id, plan_id, status, mollie_customer_id, current_period_end')
      .eq('id', metadata.subscriptionId)
      .maybeSingle()

    if (recurringSubscriptionError) {
      return NextResponse.json({ error: recurringSubscriptionError.message }, { status: 500 })
    }

    if (!recurringSubscription) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    if (recurringSubscription.company_id !== metadata.companyId) {
      console.info('mollie_recurring_payment_received', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
        reason: 'company_mismatch',
        expectedCompanyId: metadata.companyId,
        receivedCompanyId: recurringSubscription.company_id,
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const paymentCustomerId = toStringValue(payment.customerId)
    if (!paymentCustomerId) {
      console.info('mollie_recurring_payment_received', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
        reason: 'missing_customer',
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    if (!recurringSubscription.mollie_customer_id || recurringSubscription.mollie_customer_id !== paymentCustomerId) {
      console.info('mollie_recurring_payment_received', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
        reason: 'customer_mismatch',
        expectedCustomerId: recurringSubscription.mollie_customer_id,
        receivedCustomerId: paymentCustomerId,
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const { data: recurringPlan, error: recurringPlanError } = await admin
      .from('plans')
      .select('id, interval')
      .eq('id', recurringSubscription.plan_id)
      .maybeSingle()

    if (recurringPlanError) {
      return NextResponse.json({ error: recurringPlanError.message }, { status: 500 })
    }

    if (!recurringPlan) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const currentPeriodEnd = parseIsoTimestamp(recurringSubscription.current_period_end)
    if (!currentPeriodEnd) {
      console.info('mollie_recurring_payment_received', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
        reason: 'missing_current_period_end',
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const newPeriodEnd = addBillingInterval(currentPeriodEnd, recurringPlan.interval)
    const nowIso = new Date().toISOString()

    const { data: recurringResult, error: recurringError } = await admin.rpc('apply_recurring_payment', {
      p_subscription_id: recurringSubscription.id,
      p_company_id: recurringSubscription.company_id,
      p_payment_id: payment.id,
      p_payment_status: payment.status,
      p_period_start: currentPeriodEnd.toISOString(),
      p_period_end: newPeriodEnd.toISOString(),
      p_now: nowIso,
    })

    if (recurringError) {
      return NextResponse.json({ error: recurringError.message }, { status: 500 })
    }

    if ((recurringResult as RecurringRpcResult) === 'extended') {
      console.info('mollie_recurring_extended', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
        periodStart: currentPeriodEnd.toISOString(),
        periodEnd: newPeriodEnd.toISOString(),
      })
    } else if ((recurringResult as RecurringRpcResult) === 'recovered') {
      console.info('mollie_recurring_recovered', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
      })
    } else if ((recurringResult as RecurringRpcResult) === 'past_due_set') {
      console.info('mollie_recurring_past_due', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
      })
    } else if ((recurringResult as RecurringRpcResult) === 'suspended') {
      console.info('mollie_recurring_suspended', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
      })
    } else if ((recurringResult as RecurringRpcResult) === 'already_processed') {
      console.info('mollie_recurring_already_processed', {
        paymentId: payment.id,
        subscriptionId: recurringSubscription.id,
      })
    }

    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (sequenceType !== 'first' || payment.status !== TERMINAL_SUCCESS_STATUS) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (!metadata.subscriptionId || !metadata.companyId) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: metadata.subscriptionId ?? null,
      reason: 'missing_metadata',
      hasSubscriptionId: Boolean(metadata.subscriptionId),
      hasCompanyId: Boolean(metadata.companyId),
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const { data: activationSubscription, error: activationSubscriptionError } = await admin
    .from('subscriptions')
    .select('id, company_id, plan_id, status, mollie_subscription_id, mollie_customer_id, current_period_start, current_period_end')
    .eq('id', metadata.subscriptionId)
    .maybeSingle()

  if (activationSubscriptionError) {
    return NextResponse.json({ error: activationSubscriptionError.message }, { status: 500 })
  }

  if (!activationSubscription) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (activationSubscription.company_id !== metadata.companyId) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'company_mismatch',
      expectedCompanyId: metadata.companyId,
      receivedCompanyId: activationSubscription.company_id,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const paymentCustomerId = toStringValue(payment.customerId)
  if (!paymentCustomerId) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'missing_customer',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  let customerId = activationSubscription.mollie_customer_id
  if (customerId && customerId !== paymentCustomerId) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'customer_mismatch',
      expectedCustomerId: customerId,
      receivedCustomerId: paymentCustomerId,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (!customerId) {
    const { error: updateCustomerError } = await admin
      .from('subscriptions')
      .update({
        mollie_customer_id: paymentCustomerId,
      })
      .eq('id', activationSubscription.id)

    if (updateCustomerError) {
      return NextResponse.json({ error: updateCustomerError.message }, { status: 500 })
    }

    customerId = paymentCustomerId
  }

  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, name, price, interval')
    .eq('id', activationSubscription.plan_id)
    .maybeSingle()

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 })
  }

  if (!plan) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const expectedCurrency = 'EUR'
  const receivedCurrency = toStringValue(payment.amount?.currency)?.toUpperCase() ?? null
  const expectedAmount = Number(Number(plan.price).toFixed(2))
  const receivedAmount = parseAmountValue(payment.amount?.value)
  if (receivedCurrency !== expectedCurrency || receivedAmount !== expectedAmount) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'amount_mismatch',
      expectedCurrency,
      receivedCurrency,
      expectedAmount,
      receivedAmount,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (activationSubscription.status === 'active') {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'already_active',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const periodStart = parseIsoTimestamp(activationSubscription.current_period_start) ?? new Date()
  const periodEnd =
    parseIsoTimestamp(activationSubscription.current_period_end) ?? addBillingInterval(periodStart, plan.interval)

  let mollieSubscriptionId = activationSubscription.mollie_subscription_id
  const shouldCreateMollieSubscription =
    activationSubscription.status !== 'active' && activationSubscription.mollie_subscription_id === null

  if (!shouldCreateMollieSubscription) {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'mollie_subscription_already_linked',
    })
  }

  if (shouldCreateMollieSubscription) {
    try {
      const createdSubscription = await createMollieSubscription(
        {
          customerId,
          amount: {
            currency: 'EUR',
            value: Number(plan.price).toFixed(2),
          },
          interval: mapPlanIntervalToMollie(plan.interval),
          description: `Summit ${plan.name} (${plan.interval})`,
          webhookUrl: `${appUrl}/api/mollie/webhook?secret=${encodeURIComponent(expectedSecret)}`,
          metadata: {
            companyId: activationSubscription.company_id,
            subscriptionId: activationSubscription.id,
            planId: plan.id,
          },
          startDate: toIsoDate(periodEnd),
        },
        {
          idempotencyKey: `summit-first-payment-${payment.id}`,
        },
      )
      const { error: persistSubscriptionLinkError } = await admin
        .from('subscriptions')
        .update({
          mollie_subscription_id: createdSubscription.id,
        })
        .eq('id', activationSubscription.id)

      if (persistSubscriptionLinkError) {
        console.error('mollie_webhook_subscription_link_persist_failed', {
          paymentId: payment.id,
          subscriptionId: activationSubscription.id,
          mollieSubscriptionId: createdSubscription.id,
          error: persistSubscriptionLinkError.message,
        })
        return NextResponse.json({ error: persistSubscriptionLinkError.message }, { status: 500 })
      }

      mollieSubscriptionId = createdSubscription.id
    } catch (error) {
      return NextResponse.json(
        { error: isMollieApiError(error) ? error.message : 'Failed to create Mollie subscription' },
        { status: 502 },
      )
    }
  }

  if (!mollieSubscriptionId) {
    return NextResponse.json({ error: 'Mollie subscription is missing on activation' }, { status: 500 })
  }

  const periodStartValue = periodStart.toISOString()
  const periodEndValue = periodEnd.toISOString()

  const { data: activationResult, error: activationError } = await admin.rpc(
    'activate_subscription_after_first_payment',
    {
      p_subscription_id: activationSubscription.id,
      p_company_id: activationSubscription.company_id,
      p_mollie_subscription_id: mollieSubscriptionId,
      p_mollie_customer_id: customerId,
      p_period_start: periodStartValue,
      p_period_end: periodEndValue,
    },
  )

  if (activationError) {
    return NextResponse.json({ error: activationError.message }, { status: 500 })
  }

  if (activationResult === 'activated') {
    console.info('mollie_webhook_activation_executed', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      mollieSubscriptionId,
    })
  } else if ((activationResult as ActivationRpcResult) === 'already_active') {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'already_active',
    })
  } else if ((activationResult as ActivationRpcResult) === 'already_linked') {
    console.info('mollie_webhook_activation_skipped', {
      paymentId: payment.id,
      subscriptionId: activationSubscription.id,
      reason: 'already_linked',
    })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
