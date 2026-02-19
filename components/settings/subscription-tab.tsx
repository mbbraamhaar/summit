'use client'

import { useSearchParams } from 'next/navigation'
import { Tables } from '@/types/database'
import {
  SubscriptionFlowInterval,
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

function normalizeStep(step: string | null): SubscriptionFlowStep {
  if (step === 'billing' || step === 'payment') {
    return step
  }

  return 'plan'
}

function normalizeInterval(interval: string | null): SubscriptionFlowInterval {
  if (interval === 'yearly') {
    return 'yearly'
  }

  return 'monthly'
}

export function SubscriptionTab({ subscription, userRole }: SubscriptionTabProps) {
  void subscription
  const searchParams = useSearchParams()
  const step = normalizeStep(searchParams.get('step'))
  const interval = normalizeInterval(searchParams.get('interval'))

  return (
    <SubscriptionSignupFlow
      isOwner={userRole === 'owner'}
      step={step}
      initialInterval={interval}
    />
  )
}
