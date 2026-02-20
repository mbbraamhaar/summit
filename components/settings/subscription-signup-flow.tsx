'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  getSubscriptionSignupState,
  updateCompanyForSubscriptionSignup,
} from '@/app/(app)/settings/subscription/actions'
import { CountryCombobox } from '@/components/settings/country-combobox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Json } from '@/types/database'

export type SubscriptionFlowStep = 'plan' | 'billing' | 'payment'

type SignupState = Extract<Awaited<ReturnType<typeof getSubscriptionSignupState>>, { success: true }>['state']

type BillingFormState = {
  street_address: string
  city: string
  postal_code: string
  country: string
  tax_id: string
  company_registration_id: string
}

type CheckoutStartResponse = {
  checkoutUrl?: string
  molliePaymentId?: string
  subscriptionId?: string
  error?: {
    code?: string
    message?: string
  }
}

const EMPTY_BILLING_FORM: BillingFormState = {
  street_address: '',
  city: '',
  postal_code: '',
  country: '',
  tax_id: '',
  company_registration_id: '',
}

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
])

function formatEuroAmount(amount: number | null | undefined) {
  if (typeof amount !== 'number') {
    return 'N/A'
  }

  return `EUR ${amount.toFixed(2)}`
}

function toUpperTrimmed(value: string) {
  return value.trim().toUpperCase()
}

function getTaxIdentityMode(country: string): 'vat' | 'registration' {
  const normalizedCountry = toUpperTrimmed(country)
  if (!normalizedCountry || normalizedCountry === 'NL') {
    return 'vat'
  }

  if (EU_COUNTRY_CODES.has(normalizedCountry)) {
    return 'vat'
  }

  return 'registration'
}

function getPlanFeatures(features: Json | null | undefined) {
  if (!features) {
    return []
  }

  if (Array.isArray(features)) {
    return features
      .map((item) => (typeof item === 'string' ? item : String(item)))
      .filter((item) => item.length > 0)
  }

  if (typeof features === 'object') {
    return Object.entries(features).map(([key, value]) => {
      if (typeof value === 'boolean') {
        return value ? key : ''
      }
      if (typeof value === 'string') {
        return `${key}: ${value}`
      }
      return key
    }).filter((item) => item.length > 0)
  }

  return [String(features)]
}

async function startCheckout(planId: string) {
  const response = await fetch('/api/billing/checkout/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planId }),
  })

  const payload = (await response.json().catch(() => null)) as CheckoutStartResponse | null
  return { response, payload }
}

function hydrateBillingForm(state: SignupState): BillingFormState {
  return {
    street_address: state.company.street_address ?? '',
    city: state.company.city ?? '',
    postal_code: state.company.postal_code ?? '',
    country: state.company.country ?? '',
    tax_id: state.company.tax_id ?? '',
    company_registration_id: state.company.company_registration_id ?? '',
  }
}

function getPlanSelectionFromState(state: SignupState) {
  const monthlyPlan = state.plan_options.monthly
  const yearlyPlan = state.plan_options.yearly

  const yearlyPerMonth = yearlyPlan ? yearlyPlan.price / 12 : null
  const savingsPct = monthlyPlan && yearlyPlan
    ? Math.round((1 - (yearlyPlan.price / (monthlyPlan.price * 12))) * 100)
    : null

  return {
    monthlyPlan,
    yearlyPlan,
    yearlyPerMonth,
    savingsPct,
  }
}

interface SubscriptionSignupFlowProps {
  isOwner: boolean
  step: SubscriptionFlowStep
  selectedPlanId: string | null
  checkoutStatus: 'processing' | null
}

export function SubscriptionSignupFlow({
  isOwner,
  step,
  selectedPlanId,
  checkoutStatus,
}: SubscriptionSignupFlowProps) {
  const router = useRouter()
  const [signupState, setSignupState] = useState<SignupState | null>(null)
  const [billingForm, setBillingForm] = useState<BillingFormState>(EMPTY_BILLING_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOwner) {
      return
    }

    let active = true
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      const result = await getSubscriptionSignupState({
        plan_id: selectedPlanId ?? undefined,
      })
      if (!active) {
        return
      }
      setIsLoading(false)

      if (!result.success) {
        setLoadError(result.error)
        return
      }

      setSignupState(result.state)
      setBillingForm(hydrateBillingForm(result.state))
    }

    void load()
    return () => {
      active = false
    }
  }, [isOwner, selectedPlanId])

  const planData = useMemo(() => {
    if (!signupState) {
      return {
        monthlyPlan: null,
        yearlyPlan: null,
        yearlyPerMonth: null,
        savingsPct: null,
      }
    }

    return getPlanSelectionFromState(signupState)
  }, [signupState])

  const selectedPlan = signupState?.selected_plan ?? null
  const taxIdentityMode = getTaxIdentityMode(billingForm.country)

  const navigateTo = (
    nextStep: SubscriptionFlowStep,
    planId?: string | null,
    options?: { preserveCheckoutError?: boolean },
  ) => {
    if (!options?.preserveCheckoutError) {
      setCheckoutError(null)
    }

    const nextPlanId = planId ?? selectedPlan?.id ?? selectedPlanId ?? null
    const params = new URLSearchParams()
    params.set('tab', 'subscription')
    if (nextPlanId) {
      params.set('plan_id', nextPlanId)
    }
    if (nextStep !== 'plan') {
      params.set('step', nextStep)
    }
    router.replace(`/settings?${params.toString()}`)
  }

  if (!isOwner) {
    return (
      <Alert>
        <AlertDescription>Only owners can manage subscription signup.</AlertDescription>
      </Alert>
    )
  }

  if (isLoading && !signupState) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading subscription signup...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Alert>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  if (!signupState) {
    return null
  }

  const selectedPlanIntervalLabel = selectedPlan
    ? selectedPlan.interval === 'year'
      ? 'yearly'
      : 'monthly'
    : 'N/A'
  const requiresPlanSelection = (step === 'billing' || step === 'payment') && !selectedPlan

  return (
    <div className="space-y-6">
      {checkoutError && (
        <Alert>
          <AlertDescription>{checkoutError}</AlertDescription>
        </Alert>
      )}

      {step === 'plan' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Plan</CardTitle>
            <CardDescription>Select monthly or yearly billing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4 text-left">
                <p className="font-semibold">{planData.monthlyPlan?.name ?? 'Monthly plan'}</p>
                <p className="text-2xl font-bold">{formatEuroAmount(planData.monthlyPlan?.price)}</p>
                <p className="text-sm text-muted-foreground">per month</p>
                <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                  {getPlanFeatures(planData.monthlyPlan?.features).map((feature) => (
                    <li key={`monthly-${feature}`}>{feature}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={!planData.monthlyPlan}
                  onClick={() => navigateTo('billing', planData.monthlyPlan?.id)}
                >
                  Select monthly
                </Button>
              </div>

              <div className="rounded-lg border p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{planData.yearlyPlan?.name ?? 'Yearly plan'}</p>
                  {typeof planData.savingsPct === 'number' && planData.savingsPct > 0 && (
                    <Badge variant="secondary">{planData.savingsPct}% saved</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold">{formatEuroAmount(planData.yearlyPlan?.price)}</p>
                <p className="text-sm text-muted-foreground">per year</p>
                <p className="text-xs text-muted-foreground">
                  {planData.yearlyPerMonth === null
                    ? 'N/A'
                    : `${formatEuroAmount(planData.yearlyPerMonth)} per month`}
                </p>
                <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                  {getPlanFeatures(planData.yearlyPlan?.features).map((feature) => (
                    <li key={`yearly-${feature}`}>{feature}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={!planData.yearlyPlan}
                  onClick={() => navigateTo('billing', planData.yearlyPlan?.id)}
                >
                  Select yearly
                </Button>
              </div>
            </div>

            {(!planData.monthlyPlan || !planData.yearlyPlan) && (
              <Alert>
                <AlertDescription>Active monthly/yearly plans are required.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'billing' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Billing information</CardTitle>
            <CardDescription>Complete company billing identity details.</CardDescription>
          </CardHeader>
          <CardContent>
            {requiresPlanSelection && (
              <Alert className="mb-4">
                <AlertDescription>Select a plan first to continue.</AlertDescription>
              </Alert>
            )}

            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()

                if (!selectedPlan) {
                  setFormError('Select a plan first to continue.')
                  return
                }

                setIsSubmitting(true)
                setFormError(null)
                setFieldErrors({})
                setCheckoutError(null)

                const result = await updateCompanyForSubscriptionSignup({
                  ...billingForm,
                  plan_id: selectedPlan.id,
                })
                setIsSubmitting(false)

                if (!result.success) {
                  setFieldErrors(result.fieldErrors ?? {})
                  setFormError(result.formError ?? (result.fieldErrors ? null : result.error))
                  if (result.state) {
                    setSignupState(result.state)
                    setBillingForm(hydrateBillingForm(result.state))
                  }
                  return
                }

                setSignupState(result.state)
                setBillingForm(hydrateBillingForm(result.state))
                navigateTo('payment')
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="billing-street-address">Street address</Label>
                <Input
                  id="billing-street-address"
                  value={billingForm.street_address}
                  onChange={(event) => setBillingForm((prev) => ({ ...prev, street_address: event.target.value }))}
                  disabled={isSubmitting}
                />
                {fieldErrors.street_address && (
                  <p className="text-sm text-destructive">{fieldErrors.street_address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-city">City</Label>
                <Input
                  id="billing-city"
                  value={billingForm.city}
                  onChange={(event) => setBillingForm((prev) => ({ ...prev, city: event.target.value }))}
                  disabled={isSubmitting}
                />
                {fieldErrors.city && <p className="text-sm text-destructive">{fieldErrors.city}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-postal-code">Postal code</Label>
                <Input
                  id="billing-postal-code"
                  value={billingForm.postal_code}
                  onChange={(event) => setBillingForm((prev) => ({ ...prev, postal_code: event.target.value }))}
                  disabled={isSubmitting}
                />
                {fieldErrors.postal_code && <p className="text-sm text-destructive">{fieldErrors.postal_code}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-country">Country</Label>
                <CountryCombobox
                  value={billingForm.country}
                  onValueChange={(value) => setBillingForm((prev) => ({ ...prev, country: value }))}
                  disabled={isSubmitting}
                />
                {fieldErrors.country && <p className="text-sm text-destructive">{fieldErrors.country}</p>}
              </div>

              {taxIdentityMode === 'vat' ? (
                <div className="space-y-2">
                  <Label htmlFor="billing-tax-id">VAT number</Label>
                  <Input
                    id="billing-tax-id"
                    value={billingForm.tax_id}
                    onChange={(event) => setBillingForm((prev) => ({ ...prev, tax_id: event.target.value }))}
                    disabled={isSubmitting}
                  />
                  {fieldErrors.tax_id && <p className="text-sm text-destructive">{fieldErrors.tax_id}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="billing-registration-id">Business registration ID</Label>
                  <Input
                    id="billing-registration-id"
                    value={billingForm.company_registration_id}
                    onChange={(event) =>
                      setBillingForm((prev) => ({ ...prev, company_registration_id: event.target.value }))}
                    disabled={isSubmitting}
                  />
                  {fieldErrors.company_registration_id && (
                    <p className="text-sm text-destructive">{fieldErrors.company_registration_id}</p>
                  )}
                </div>
              )}

              {formError && (
                <Alert>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => navigateTo('plan')} disabled={isSubmitting}>
                  Back
                </Button>
                <Button type="submit" disabled={isSubmitting || !selectedPlan}>
                  {isSubmitting ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'payment' && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Payment</CardTitle>
            <CardDescription>Review and continue to Mollie checkout.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Plan:</span> {selectedPlan?.name ?? 'N/A'}</p>
              <p><span className="font-medium">Interval:</span> {selectedPlanIntervalLabel}</p>
              <p><span className="font-medium">Price:</span> {formatEuroAmount(selectedPlan?.price)}</p>
            </div>

            {requiresPlanSelection && (
              <Alert>
                <AlertDescription>Select a plan first to continue.</AlertDescription>
              </Alert>
            )}

            {checkoutStatus === 'processing' && (
              <Alert>
                <AlertDescription>
                  Processing payment... Activation may take a moment while we receive confirmation.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Street address:</span> {signupState.company.street_address ?? 'N/A'}</p>
              <p><span className="font-medium">City:</span> {signupState.company.city ?? 'N/A'}</p>
              <p><span className="font-medium">Postal code:</span> {signupState.company.postal_code ?? 'N/A'}</p>
              <p><span className="font-medium">Country:</span> {signupState.company.country ?? 'N/A'}</p>
              <p><span className="font-medium">VAT ID:</span> {signupState.company.tax_id ?? 'N/A'}</p>
              <p>
                <span className="font-medium">Business registration ID:</span>{' '}
                {signupState.company.company_registration_id ?? 'N/A'}
              </p>
            </div>

            <Button
              type="button"
              disabled={isCreatingCheckout || !selectedPlan}
              onClick={async () => {
                if (!selectedPlan) {
                  setCheckoutError('Select a plan first to continue.')
                  navigateTo('plan', null, { preserveCheckoutError: true })
                  return
                }

                setCheckoutError(null)
                setIsCreatingCheckout(true)

                const { response, payload } = await startCheckout(selectedPlan.id)

                setIsCreatingCheckout(false)

                if (!response.ok) {
                  const message = payload?.error?.message ?? 'Failed to start checkout.'
                  const code = payload?.error?.code
                  setCheckoutError(message)

                  if (code === 'INVALID_PLAN') {
                    navigateTo('plan', null, { preserveCheckoutError: true })
                    return
                  }

                  return
                }

                if (!payload?.checkoutUrl) {
                  setCheckoutError('Checkout response was invalid.')
                  return
                }

                window.location.assign(payload.checkoutUrl)
              }}
            >
              {isCreatingCheckout ? 'Starting checkout...' : 'Proceed to Mollie checkout'}
            </Button>

            <div>
              <Button type="button" variant="outline" onClick={() => navigateTo('billing')}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
