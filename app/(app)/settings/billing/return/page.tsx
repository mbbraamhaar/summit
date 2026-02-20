'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type CheckoutStatusPayload = {
  subscription: { id: string; status: string }
  company: { status: string | null }
  latestFirstPaymentAttempt: { status: string; molliePaymentId: string; createdAt: string } | null
}

type UiState = 'processing' | 'active' | 'failure'

const FAILURE_PAYMENT_STATUSES = new Set(['failed', 'expired', 'canceled'])

function deriveUiState(payload: CheckoutStatusPayload): UiState {
  if (payload.subscription.status === 'active') {
    return 'active'
  }

  if (payload.latestFirstPaymentAttempt && FAILURE_PAYMENT_STATUSES.has(payload.latestFirstPaymentAttempt.status)) {
    return 'failure'
  }

  return 'processing'
}

export default function BillingCheckoutReturnPage() {
  const searchParams = useSearchParams()
  const subscriptionId = useMemo(() => searchParams.get('subscriptionId'), [searchParams])
  const missingSubscriptionId = !subscriptionId
  const [isLoading, setIsLoading] = useState(!missingSubscriptionId)
  const [error, setError] = useState<string | null>(null)
  const [statusPayload, setStatusPayload] = useState<CheckoutStatusPayload | null>(null)
  const [uiState, setUiState] = useState<UiState>('processing')

  useEffect(() => {
    if (missingSubscriptionId) {
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const loadStatus = async () => {
      const response = await fetch(
        `/api/billing/checkout/status?subscriptionId=${encodeURIComponent(subscriptionId)}`,
        { cache: 'no-store' },
      )

      const payload = (await response.json().catch(() => null)) as CheckoutStatusPayload | null

      if (cancelled) {
        return
      }

      if (!response.ok || !payload) {
        setIsLoading(false)
        setError('Failed to load checkout status.')
        return
      }

      const nextUiState = deriveUiState(payload)
      setStatusPayload(payload)
      setUiState(nextUiState)
      setIsLoading(false)
      setError(null)

      if (nextUiState === 'processing') {
        timeoutId = setTimeout(() => {
          void loadStatus()
        }, 3000)
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [missingSubscriptionId, subscriptionId])

  return (
    <div className="container max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Billing checkout</CardTitle>
          <CardDescription>We are confirming your payment status with Mollie webhooks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <Alert>
              <AlertDescription>Loading checkout status...</AlertDescription>
            </Alert>
          )}

          {missingSubscriptionId && (
            <Alert>
              <AlertDescription>Missing subscription id in return URL.</AlertDescription>
            </Alert>
          )}

          {error && !missingSubscriptionId && (
            <Alert>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isLoading && !missingSubscriptionId && !error && statusPayload && (
            <>
              {uiState === 'processing' && <Badge variant="secondary">Processing</Badge>}
              {uiState === 'active' && <Badge>Active</Badge>}
              {uiState === 'failure' && <Badge variant="destructive">Failed</Badge>}

              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Subscription status:</span> {statusPayload.subscription.status}</p>
                <p><span className="font-medium">Company status:</span> {statusPayload.company.status ?? 'N/A'}</p>
                <p>
                  <span className="font-medium">First payment status:</span>{' '}
                  {statusPayload.latestFirstPaymentAttempt?.status ?? 'N/A'}
                </p>
              </div>
            </>
          )}

          <Button asChild variant="outline">
            <Link href="/settings?tab=subscription">Back to subscription settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
