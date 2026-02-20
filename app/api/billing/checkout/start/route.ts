import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createMollieCustomer, createMolliePayment, isMollieApiError } from '@/lib/mollie'
import { createClient } from '@/lib/supabase/server'
import { type Json, type TablesInsert } from '@/types/database'

const requestSchema = z.object({
  planId: z.string().uuid(),
})

type StartCheckoutErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_PLAN'
  | 'ACTIVE_SUBSCRIPTION_CONFLICT'
  | 'CONFIGURATION_ERROR'
  | 'CHECKOUT_CREATION_FAILED'

function jsonError(status: number, code: StartCheckoutErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function formatAmountValue(price: number) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Plan price is invalid')
  }

  return price.toFixed(2)
}

function getConfiguredUrls(subscriptionId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.MOLLIE_WEBHOOK_SECRET

  if (!appUrl || !webhookSecret) {
    throw new Error('Billing environment is not configured')
  }

  return {
    redirectUrl: `${appUrl}/settings/billing/return?subscriptionId=${subscriptionId}`,
    webhookUrl: `${appUrl}/api/mollie/webhook?secret=${encodeURIComponent(webhookSecret)}`,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError(401, 'UNAUTHENTICATED', 'You must be signed in to start checkout.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_id, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return jsonError(401, 'UNAUTHENTICATED', 'Profile not found for current session.')
  }

  if (profile.role !== 'owner') {
    return jsonError(403, 'FORBIDDEN', 'Only owners can start checkout.')
  }

  const payload = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, 'INVALID_PLAN', parsed.error.issues[0]?.message ?? 'Invalid request payload.')
  }

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, name, price, interval, is_active')
    .eq('id', parsed.data.planId)
    .eq('is_active', true)
    .maybeSingle()

  if (planError) {
    return jsonError(500, 'CHECKOUT_CREATION_FAILED', planError.message)
  }

  if (!plan) {
    return jsonError(400, 'INVALID_PLAN', 'Selected plan is not active or does not exist.')
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', profile.company_id)
    .maybeSingle()

  if (companyError) {
    return jsonError(500, 'CHECKOUT_CREATION_FAILED', companyError.message)
  }

  if (!company) {
    return jsonError(404, 'CHECKOUT_CREATION_FAILED', 'Company not found.')
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from('subscriptions')
    .select('id, company_id, plan_id, status, mollie_customer_id')
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (existingSubscriptionError) {
    return jsonError(500, 'CHECKOUT_CREATION_FAILED', existingSubscriptionError.message)
  }

  if (existingSubscription?.status === 'active') {
    if (existingSubscription.plan_id !== plan.id) {
      return jsonError(
        409,
        'ACTIVE_SUBSCRIPTION_CONFLICT',
        'An active subscription already exists with a different plan. Plan changes for active subscriptions are not supported in this flow.',
      )
    }

    return jsonError(409, 'ACTIVE_SUBSCRIPTION_CONFLICT', 'An active subscription already exists for this plan.')
  }

  let subscription =
    existingSubscription ??
    null

  if (!subscription) {
    const insertPayload: TablesInsert<'subscriptions'> = {
      company_id: profile.company_id,
      plan_id: plan.id,
      status: 'pending',
      cancel_at_period_end: false,
      mollie_customer_id: null,
      mollie_subscription_id: null,
      current_period_start: null,
      current_period_end: null,
    }

    const { data: insertedSubscription, error: insertError } = await supabase
      .from('subscriptions')
      .insert(insertPayload)
      .select('id, company_id, plan_id, status, mollie_customer_id')
      .single()

    if (insertError) {
      return jsonError(500, 'CHECKOUT_CREATION_FAILED', insertError.message)
    }

    subscription = insertedSubscription
  } else {
    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: plan.id,
        status: 'pending',
        cancel_at_period_end: false,
        mollie_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
      })
      .eq('id', subscription.id)
      .select('id, company_id, plan_id, status, mollie_customer_id')
      .single()

    if (updateError) {
      return jsonError(500, 'CHECKOUT_CREATION_FAILED', updateError.message)
    }

    subscription = updatedSubscription
  }

  let mollieCustomerId = subscription.mollie_customer_id
  if (!mollieCustomerId) {
    try {
      const customer = await createMollieCustomer({
        name: company.name,
        email: profile.email,
        metadata: {
          companyId: company.id,
        },
      })
      mollieCustomerId = customer.id
    } catch (error) {
      return jsonError(
        502,
        'CHECKOUT_CREATION_FAILED',
        isMollieApiError(error) ? error.message : 'Failed to create Mollie customer.',
      )
    }

    const { error: updateCustomerError } = await supabase
      .from('subscriptions')
      .update({ mollie_customer_id: mollieCustomerId })
      .eq('id', subscription.id)

    if (updateCustomerError) {
      return jsonError(500, 'CHECKOUT_CREATION_FAILED', updateCustomerError.message)
    }
  }

  let configuredUrls: { redirectUrl: string; webhookUrl: string }
  try {
    configuredUrls = getConfiguredUrls(subscription.id)
  } catch (error) {
    return jsonError(
      500,
      'CONFIGURATION_ERROR',
      error instanceof Error ? error.message : 'Billing environment is not configured',
    )
  }

  let payment: Awaited<ReturnType<typeof createMolliePayment>>
  try {
    payment = await createMolliePayment({
      amount: {
        currency: 'EUR',
        value: formatAmountValue(plan.price),
      },
      description: `Summit ${plan.name} (${plan.interval})`,
      customerId: mollieCustomerId,
      sequenceType: 'first',
      redirectUrl: configuredUrls.redirectUrl,
      webhookUrl: configuredUrls.webhookUrl,
      metadata: {
        companyId: profile.company_id,
        subscriptionId: subscription.id,
        planId: plan.id,
        interval: plan.interval,
      },
      method: ['creditcard'],
    })
  } catch (error) {
    return jsonError(
      502,
      'CHECKOUT_CREATION_FAILED',
      isMollieApiError(error) ? error.message : 'Failed to create Mollie payment.',
    )
  }

  const checkoutUrl = payment._links?.checkout?.href
  if (!checkoutUrl) {
    return jsonError(502, 'CHECKOUT_CREATION_FAILED', 'Mollie did not return a checkout URL.')
  }

  const { error: attemptInsertError } = await supabase
    .from('subscription_payment_attempts')
    .insert({
      company_id: profile.company_id,
      subscription_id: subscription.id,
      plan_id: plan.id,
      mollie_payment_id: payment.id,
      sequence_type: 'first',
      status: payment.status,
      amount: plan.price,
      currency: 'EUR',
      raw: payment as unknown as Json,
    })

  if (attemptInsertError) {
    return jsonError(500, 'CHECKOUT_CREATION_FAILED', attemptInsertError.message)
  }

  return NextResponse.json({
    checkoutUrl,
    molliePaymentId: payment.id,
    subscriptionId: subscription.id,
  })
}
