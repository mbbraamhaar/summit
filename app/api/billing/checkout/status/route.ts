import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const querySchema = z.object({
  subscriptionId: z.string().uuid(),
})

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError(401, 'UNAUTHENTICATED', 'You must be signed in to check checkout status.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return jsonError(401, 'UNAUTHENTICATED', 'Profile not found for current session.')
  }

  if (profile.role !== 'owner') {
    return jsonError(403, 'FORBIDDEN', 'Only owners can read checkout status.')
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    subscriptionId: url.searchParams.get('subscriptionId'),
  })

  if (!parsed.success) {
    return jsonError(400, 'INVALID_SUBSCRIPTION_ID', parsed.error.issues[0]?.message ?? 'Invalid subscription id.')
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id, company_id, status')
    .eq('id', parsed.data.subscriptionId)
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (subscriptionError) {
    return jsonError(500, 'CHECKOUT_STATUS_FAILED', subscriptionError.message)
  }

  if (!subscription) {
    return jsonError(404, 'NOT_FOUND', 'Subscription not found for this company.')
  }

  const nowIso = new Date().toISOString()
  const { data: expiryResult, error: expiryError } = await supabase.rpc(
    'evaluate_subscription_period_expiry',
    {
      p_subscription_id: subscription.id,
      p_company_id: profile.company_id,
      p_now: nowIso,
    },
  )

  if (expiryError) {
    return jsonError(500, 'CHECKOUT_STATUS_FAILED', expiryError.message)
  }

  if (expiryResult === 'canceled') {
    console.info('mollie_subscription_period_expired_canceled', {
      subscriptionId: subscription.id,
      companyId: profile.company_id,
      evaluatedAt: nowIso,
    })
  }

  const [{ data: freshSubscription, error: freshSubscriptionError }, { data: company, error: companyError }, { data: paymentAttempt, error: attemptError }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, status')
      .eq('id', subscription.id)
      .eq('company_id', profile.company_id)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('status')
      .eq('id', profile.company_id)
      .maybeSingle(),
    supabase
      .from('subscription_payment_attempts')
      .select('mollie_payment_id, status, created_at')
      .eq('subscription_id', subscription.id)
      .eq('sequence_type', 'first')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (freshSubscriptionError) {
    return jsonError(500, 'CHECKOUT_STATUS_FAILED', freshSubscriptionError.message)
  }

  if (!freshSubscription) {
    return jsonError(404, 'NOT_FOUND', 'Subscription not found for this company.')
  }

  if (companyError) {
    return jsonError(500, 'CHECKOUT_STATUS_FAILED', companyError.message)
  }

  if (attemptError) {
    return jsonError(500, 'CHECKOUT_STATUS_FAILED', attemptError.message)
  }

  return NextResponse.json({
    subscription: {
      id: freshSubscription.id,
      status: freshSubscription.status,
    },
    company: {
      status: company?.status ?? null,
    },
    latestFirstPaymentAttempt: paymentAttempt
      ? {
          molliePaymentId: paymentAttempt.mollie_payment_id,
          status: paymentAttempt.status,
          createdAt: paymentAttempt.created_at,
        }
      : null,
  })
}
