'use client'

import { useSearchParams } from 'next/navigation'
import { Tables } from '@/types/database'
import {
  SubscriptionFlowStep,
  SubscriptionSignupFlow,
} from '@/components/settings/subscription-signup-flow'

type Subscription = Tables<'subscriptions'> & {
  plan: Tables<'plans'> | null
}

interface SubscriptionTabProps {
  subscription: Subscription | null
  userRole: string
}

type SubscriptionCheckoutStatus = 'processing' | null

function normalizeStep(step: string | null): SubscriptionFlowStep {
  if (step === 'billing' || step === 'payment') {
    return step
  }

  return 'plan'
}

function normalizePlanId(planId: string | null) {
  if (!planId) {
    return null
  }

  // Keep URL parsing lenient but avoid passing obviously invalid identifiers to the server action.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)
    ? planId
    : null
}

function normalizeCheckoutStatus(status: string | null): SubscriptionCheckoutStatus {
  if (status === 'processing') {
    return 'processing'
  }

  return null
}

export function SubscriptionTab({ subscription, userRole }: SubscriptionTabProps) {
  void subscription
  const searchParams = useSearchParams()
  const step = normalizeStep(searchParams.get('step'))
  const planId = normalizePlanId(searchParams.get('plan_id'))
  const checkoutStatus = normalizeCheckoutStatus(searchParams.get('checkout'))

  return (
    <SubscriptionSignupFlow
      isOwner={userRole === 'owner'}
      step={step}
      selectedPlanId={planId}
      checkoutStatus={checkoutStatus}
    />
  )
}
