import { NextResponse } from 'next/server'
import {
  createMollieSubscription,
  getMolliePayment,
  isMollieApiError,
  type MolliePayment,
} from '@/lib/mollie'
import { createAdminClient } from '@/lib/supabase/admin'
import { type Json } from '@/types/database'

const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'expired', 'canceled'])
const TERMINAL_SUCCESS_STATUS = 'paid'

type SequenceType = 'first' | 'recurring'

type PaymentMetadata = {
  companyId: string | null
  subscriptionId: string | null
  planId: string | null
  interval: string | null
}

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

async function extractPaymentIdFromRequest(request: Request) {
  const rawBody = (await request.text()).trim()
  if (!rawBody) {
    return null
  }

  const params = new URLSearchParams(rawBody)
  const formPaymentId = params.get('id')
  if (formPaymentId) {
    return formPaymentId
  }

  try {
    const json = JSON.parse(rawBody) as unknown
    if (json && typeof json === 'object' && 'id' in json) {
      const candidate = (json as { id?: unknown }).id
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
  } catch {
    // Ignore and continue.
  }

  return rawBody.startsWith('tr_') ? rawBody : null
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

  const paymentId = await extractPaymentIdFromRequest(request)
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  let payment: MolliePayment
  try {
    payment = await getMolliePayment(paymentId)
  } catch (error) {
    return NextResponse.json(
      { error: isMollieApiError(error) ? error.message : 'Failed to load payment from Mollie' },
      { status: 502 },
    )
  }

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

  const sequenceType = existingAttempt?.sequence_type ?? mapSequenceType(payment.sequenceType)

  if (existingAttempt) {
    const { error: updateAttemptError } = await admin
      .from('subscription_payment_attempts')
      .update({
        status: payment.status,
        raw: payment as unknown as Json,
        subscription_id: existingAttempt.subscription_id ?? metadata.subscriptionId,
      })
      .eq('id', existingAttempt.id)

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
      return NextResponse.json({ error: insertAttemptError.message }, { status: 500 })
    }
  }

  if (!isTerminalStatus(payment.status)) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const subscription = await getWebhookSubscription(admin, {
    subscriptionId: existingAttempt?.subscription_id ?? metadata.subscriptionId,
    companyId: existingAttempt?.company_id ?? metadata.companyId,
  })

  if (!subscription) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (sequenceType === 'first' && TERMINAL_FAILURE_STATUSES.has(payment.status)) {
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

  if (sequenceType !== 'first' || payment.status !== TERMINAL_SUCCESS_STATUS) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, name, price, interval')
    .eq('id', subscription.plan_id)
    .maybeSingle()

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 })
  }

  if (!plan) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const customerId = subscription.mollie_customer_id ?? payment.customerId ?? null
  if (!customerId) {
    return NextResponse.json({ error: 'Mollie customer is missing on subscription' }, { status: 500 })
  }

  let mollieSubscriptionId = subscription.mollie_subscription_id
  const periodStart = new Date()
  const periodEnd = addBillingInterval(periodStart, plan.interval)

  if (!mollieSubscriptionId) {
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
            companyId: subscription.company_id,
            subscriptionId: subscription.id,
            planId: plan.id,
          },
          startDate: toIsoDate(periodEnd),
        },
        {
          idempotencyKey: `summit-first-payment-${payment.id}`,
        },
      )
      mollieSubscriptionId = createdSubscription.id
    } catch (error) {
      return NextResponse.json(
        { error: isMollieApiError(error) ? error.message : 'Failed to create Mollie subscription' },
        { status: 502 },
      )
    }
  }

  const periodStartValue = subscription.current_period_start ?? periodStart.toISOString()
  const periodEndValue = subscription.current_period_end ?? periodEnd.toISOString()

  const { error: activateSubscriptionError } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: periodStartValue,
      current_period_end: periodEndValue,
      mollie_subscription_id: mollieSubscriptionId,
      mollie_customer_id: customerId,
      cancel_at_period_end: false,
    })
    .eq('id', subscription.id)

  if (activateSubscriptionError) {
    return NextResponse.json({ error: activateSubscriptionError.message }, { status: 500 })
  }

  const { error: activateCompanyError } = await admin
    .from('companies')
    .update({
      status: 'active',
    })
    .eq('id', subscription.company_id)

  if (activateCompanyError) {
    return NextResponse.json({ error: activateCompanyError.message }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
