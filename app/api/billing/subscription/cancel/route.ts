import { NextResponse } from 'next/server'
import { cancelMollieSubscription, isMollieApiError } from '@/lib/mollie'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type CancelErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'CANCEL_FAILED'

function jsonError(status: number, code: CancelErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function jsonSuccess(payload: {
  status: string
  cancel_at_period_end: boolean
  current_period_end: string | null
}) {
  return NextResponse.json(payload)
}

export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError(401, 'UNAUTHENTICATED', 'You must be signed in to cancel your subscription.')
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
    return jsonError(403, 'FORBIDDEN', 'Only owners can cancel subscriptions.')
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id, company_id, status, cancel_at_period_end, current_period_end, mollie_subscription_id, mollie_customer_id')
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (subscriptionError) {
    return jsonError(500, 'CANCEL_FAILED', subscriptionError.message)
  }

  if (!subscription) {
    return jsonError(404, 'NOT_FOUND', 'Subscription not found for this company.')
  }

  if (subscription.status === 'canceled') {
    console.info('mollie_subscription_cancel_idempotent', {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      reason: 'already_canceled',
    })
    return jsonSuccess({
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      current_period_end: subscription.current_period_end,
    })
  }

  if (subscription.cancel_at_period_end) {
    console.info('mollie_subscription_cancel_idempotent', {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      reason: 'already_cancel_at_period_end',
    })
    return jsonSuccess({
      status: subscription.status,
      cancel_at_period_end: true,
      current_period_end: subscription.current_period_end,
    })
  }

  if (subscription.status === 'pending') {
    return jsonError(409, 'INVALID_STATE', 'Cannot cancel a pending subscription.')
  }

  if (!subscription.mollie_subscription_id || !subscription.mollie_customer_id) {
    return jsonError(409, 'INVALID_STATE', 'Subscription is not linked to Mollie.')
  }

  console.info('mollie_subscription_cancel_requested', {
    subscriptionId: subscription.id,
    companyId: subscription.company_id,
    mollieSubscriptionId: subscription.mollie_subscription_id,
  })

  try {
    await cancelMollieSubscription({
      customerId: subscription.mollie_customer_id,
      subscriptionId: subscription.mollie_subscription_id,
    })
  } catch (error) {
    return jsonError(
      502,
      'CANCEL_FAILED',
      isMollieApiError(error) ? error.message : 'Failed to cancel Mollie subscription.',
    )
  }

  const { error: cancelAtPeriodEndError } = await supabase
    .from('subscriptions')
    .update({
      cancel_at_period_end: true,
    })
    .eq('id', subscription.id)

  if (cancelAtPeriodEndError) {
    return jsonError(500, 'CANCEL_FAILED', cancelAtPeriodEndError.message)
  }

  return jsonSuccess({
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: subscription.current_period_end,
  })
}
