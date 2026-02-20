import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isMollieApiError, updateMollieSubscription } from '@/lib/mollie'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const requestSchema = z.object({
  planId: z.string().uuid(),
})

type ChangePlanErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_PLAN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'CONFIGURATION_ERROR'
  | 'CHANGE_FAILED'

function jsonError(status: number, code: ChangePlanErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function mapPlanIntervalToMollie(interval: string) {
  return interval === 'year' ? '12 months' : '1 month'
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseIsoTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getConfiguredWebhookUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.MOLLIE_WEBHOOK_SECRET

  if (!appUrl || !webhookSecret) {
    throw new Error('Billing environment is not configured')
  }

  return `${appUrl}/api/mollie/webhook?secret=${encodeURIComponent(webhookSecret)}`
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError(401, 'UNAUTHENTICATED', 'You must be signed in to change plans.')
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
    return jsonError(403, 'FORBIDDEN', 'Only owners can change plans.')
  }

  const payload = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, 'INVALID_PLAN', parsed.error.issues[0]?.message ?? 'Invalid request payload.')
  }

  const { data: nextPlan, error: nextPlanError } = await supabase
    .from('plans')
    .select('id, name, price, interval, is_active')
    .eq('id', parsed.data.planId)
    .eq('is_active', true)
    .maybeSingle()

  if (nextPlanError) {
    return jsonError(500, 'CHANGE_FAILED', nextPlanError.message)
  }

  if (!nextPlan) {
    return jsonError(400, 'INVALID_PLAN', 'Selected plan is not active or does not exist.')
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id, company_id, plan_id, pending_plan_id, status, cancel_at_period_end, current_period_end, mollie_customer_id, mollie_subscription_id')
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (subscriptionError) {
    return jsonError(500, 'CHANGE_FAILED', subscriptionError.message)
  }

  if (!subscription) {
    return jsonError(404, 'NOT_FOUND', 'Subscription not found for this company.')
  }

  if (subscription.pending_plan_id === nextPlan.id) {
    console.info('mollie_plan_change_idempotent', {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      currentPlanId: subscription.plan_id,
      pendingPlanId: nextPlan.id,
      reason: 'already_pending_same_plan',
    })

    return NextResponse.json({
      current_plan_id: subscription.plan_id,
      pending_plan_id: nextPlan.id,
      effective_at: subscription.current_period_end,
    })
  }

  if (subscription.plan_id === nextPlan.id && !subscription.pending_plan_id) {
    console.info('mollie_plan_change_idempotent', {
      subscriptionId: subscription.id,
      companyId: subscription.company_id,
      currentPlanId: subscription.plan_id,
      pendingPlanId: null,
      reason: 'already_on_plan',
    })

    return NextResponse.json({
      current_plan_id: subscription.plan_id,
      pending_plan_id: null,
      effective_at: subscription.current_period_end,
    })
  }

  if (subscription.status !== 'active') {
    return jsonError(409, 'INVALID_STATE', 'Only active subscriptions can schedule a plan change.')
  }

  if (subscription.cancel_at_period_end) {
    return jsonError(409, 'INVALID_STATE', 'Cannot schedule a plan change while cancellation is pending.')
  }

  if (!subscription.mollie_customer_id || !subscription.mollie_subscription_id) {
    return jsonError(409, 'INVALID_STATE', 'Subscription is not linked to Mollie.')
  }

  const periodEnd = parseIsoTimestamp(subscription.current_period_end)
  if (!periodEnd) {
    return jsonError(409, 'INVALID_STATE', 'Current subscription period end is missing.')
  }

  const { data: currentPlan, error: currentPlanError } = await supabase
    .from('plans')
    .select('id, name, price, interval')
    .eq('id', subscription.plan_id)
    .maybeSingle()

  if (currentPlanError) {
    return jsonError(500, 'CHANGE_FAILED', currentPlanError.message)
  }

  if (!currentPlan) {
    return jsonError(500, 'CHANGE_FAILED', 'Current subscription plan could not be loaded.')
  }

  let webhookUrl: string
  try {
    webhookUrl = getConfiguredWebhookUrl()
  } catch (error) {
    return jsonError(
      500,
      'CONFIGURATION_ERROR',
      error instanceof Error ? error.message : 'Billing environment is not configured',
    )
  }

  const effectiveDate = toIsoDate(periodEnd)
  try {
    await updateMollieSubscription(
      {
        customerId: subscription.mollie_customer_id,
        subscriptionId: subscription.mollie_subscription_id,
        patch: {
          amount: {
            currency: 'EUR',
            value: Number(nextPlan.price).toFixed(2),
          },
          interval: mapPlanIntervalToMollie(nextPlan.interval),
          startDate: effectiveDate,
          description: `Summit ${nextPlan.name} (${nextPlan.interval})`,
          metadata: {
            companyId: subscription.company_id,
            subscriptionId: subscription.id,
            planId: nextPlan.id,
          },
          webhookUrl,
        },
      },
      {
        idempotencyKey: `summit-plan-change-${subscription.id}-${nextPlan.id}-${effectiveDate}`,
      },
    )
  } catch (error) {
    return jsonError(
      502,
      'CHANGE_FAILED',
      isMollieApiError(error) ? error.message : 'Failed to update Mollie subscription.',
    )
  }

  const { error: updatePendingPlanError } = await supabase
    .from('subscriptions')
    .update({
      pending_plan_id: nextPlan.id,
    })
    .eq('id', subscription.id)

  if (updatePendingPlanError) {
    return jsonError(500, 'CHANGE_FAILED', updatePendingPlanError.message)
  }

  console.info('mollie_plan_change_scheduled', {
    subscriptionId: subscription.id,
    companyId: subscription.company_id,
    currentPlanId: currentPlan.id,
    pendingPlanId: nextPlan.id,
    effectiveAt: subscription.current_period_end,
  })

  return NextResponse.json({
    current_plan_id: currentPlan.id,
    pending_plan_id: nextPlan.id,
    effective_at: subscription.current_period_end,
  })
}
