'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getProfileOrRedirect } from '@/lib/auth/require-profile'
import { COUNTRIES } from '@/lib/constants/countries'
import { resolveSubscriptionRequirements } from '@/lib/subscription/requirements'
import { type Json, type Tables, type TablesUpdate } from '@/types/database'

type SubscriptionCompanyIdentity = Pick<
  Tables<'companies'>,
  | 'name'
  | 'country'
  | 'street_address'
  | 'city'
  | 'postal_code'
  | 'tax_id'
  | 'company_registration_id'
>

type SubscriptionPlan = Pick<Tables<'plans'>, 'id' | 'name' | 'description' | 'price' | 'interval' | 'features'>

type SubscriptionSignupState = {
  company: SubscriptionCompanyIdentity
  plans: SubscriptionPlan[]
  requirements: ReturnType<typeof resolveSubscriptionRequirements>
}

type SubscriptionSignupStateResult =
  | { success: true; state: SubscriptionSignupState }
  | { success: false; error: string }

type SubscriptionSignupUpdateResult =
  | { success: true; state: SubscriptionSignupState }
  | {
      success: false
      error: string
      fieldErrors?: Record<string, string>
      formError?: string
      state?: SubscriptionSignupState
    }

const COMPANY_IDENTITY_SELECT = `
  name,
  country,
  street_address,
  city,
  postal_code,
  tax_id,
  company_registration_id
`

const PLAN_SELECT = `
  id,
  name,
  description,
  price,
  interval,
  features
`

const countryCodeSet = new Set(COUNTRIES.map((country) => country.code))

const updateSchema = z.object({
  street_address: z.string().trim(),
  city: z.string().trim(),
  postal_code: z.string().trim(),
  country: z.string().trim(),
  tax_id: z.string().trim().optional(),
  company_registration_id: z.string().trim().optional(),
})

function normalizeNullableString(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function buildState(
  company: SubscriptionCompanyIdentity,
  plans: SubscriptionPlan[],
): SubscriptionSignupState {
  return {
    company,
    plans,
    requirements: resolveSubscriptionRequirements(company),
  }
}

function mapRequirementErrors(requirements: ReturnType<typeof resolveSubscriptionRequirements>) {
  const fieldErrors: Record<string, string> = {}
  let formError: string | undefined

  requirements.ordered_requirements.forEach((requirement) => {
    switch (requirement.blocking_reason) {
      case 'MISSING_COUNTRY':
        fieldErrors.country = 'Required to continue'
        break
      case 'MISSING_STREET_ADDRESS':
        fieldErrors.street_address = 'Required to continue'
        break
      case 'MISSING_CITY':
        fieldErrors.city = 'Required to continue'
        break
      case 'MISSING_POSTAL_CODE':
        fieldErrors.postal_code = 'Required to continue'
        break
      case 'MISSING_VAT_ID':
        fieldErrors.tax_id = 'Required to continue'
        break
      case 'INVALID_VAT_ID_FORMAT':
        fieldErrors.tax_id = 'Invalid VAT ID format'
        break
      case 'MISSING_BUSINESS_REGISTRATION_ID':
        fieldErrors.company_registration_id = 'Required to continue'
        break
      case 'INVALID_BUSINESS_REGISTRATION_FORMAT':
        fieldErrors.company_registration_id = 'Invalid business registration format'
        break
      case 'REQUIRES_VIES_VALIDATION':
        formError = 'VIES validation required'
        break
      default:
        break
    }
  })

  return {
    fieldErrors,
    formError,
  }
}

async function loadCompanyIdentity(
  supabase: Awaited<ReturnType<typeof getProfileOrRedirect>>['supabase'],
  companyId: string,
) {
  const { data: company, error } = await supabase
    .from('companies')
    .select(COMPANY_IDENTITY_SELECT)
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    return { company: null, error: error.message }
  }

  if (!company) {
    return { company: null, error: 'Company not found' }
  }

  return { company: company as SubscriptionCompanyIdentity, error: null }
}

async function loadActivePlans(
  supabase: Awaited<ReturnType<typeof getProfileOrRedirect>>['supabase'],
) {
  const { data: plans, error } = await supabase
    .from('plans')
    .select(PLAN_SELECT)
    .eq('is_active', true)
    .in('interval', ['month', 'year'])
    .order('interval', { ascending: true })

  if (error) {
    return { plans: null, error: error.message }
  }

  return {
    plans: ((plans ?? []) as SubscriptionPlan[]).map((plan) => ({
      ...plan,
      features: (plan.features ?? null) as Json,
    })),
    error: null,
  }
}

export async function getSubscriptionSignupState(): Promise<SubscriptionSignupStateResult> {
  const { supabase, profile } = await getProfileOrRedirect()

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can manage subscription signup' }
  }

  const [{ company, error: companyError }, { plans, error: plansError }] = await Promise.all([
    loadCompanyIdentity(supabase, profile.company_id),
    loadActivePlans(supabase),
  ])

  if (companyError || !company) {
    return { success: false, error: companyError ?? 'Company not found' }
  }

  if (plansError || !plans) {
    return { success: false, error: plansError ?? 'Plans not found' }
  }

  return {
    success: true,
    state: buildState(company, plans),
  }
}

export async function updateCompanyForSubscriptionSignup(
  payload: unknown,
): Promise<SubscriptionSignupUpdateResult> {
  const { supabase, profile } = await getProfileOrRedirect()

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can manage subscription signup' }
  }

  const parsedPayload = updateSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return {
      success: false,
      error: parsedPayload.error.issues[0]?.message ?? 'Invalid payload',
    }
  }

  const [{ company: existingCompany, error: companyError }, { plans, error: plansError }] = await Promise.all([
    loadCompanyIdentity(supabase, profile.company_id),
    loadActivePlans(supabase),
  ])

  if (companyError || !existingCompany) {
    return { success: false, error: companyError ?? 'Company not found' }
  }

  if (plansError || !plans) {
    return { success: false, error: plansError ?? 'Plans not found' }
  }

  const normalizedCountry = normalizeNullableString(parsedPayload.data.country)?.toUpperCase() ?? ''
  const updatePayload: TablesUpdate<'companies'> = {
    street_address: normalizeNullableString(parsedPayload.data.street_address),
    city: normalizeNullableString(parsedPayload.data.city),
    postal_code: normalizeNullableString(parsedPayload.data.postal_code),
    country: normalizedCountry || null,
    tax_id: normalizeNullableString(parsedPayload.data.tax_id)?.toUpperCase() ?? null,
    company_registration_id:
      normalizeNullableString(parsedPayload.data.company_registration_id)?.toUpperCase() ?? null,
  }

  const fieldErrors: Record<string, string> = {}
  if (!normalizedCountry) {
    fieldErrors.country = 'Required to continue'
  } else if (!countryCodeSet.has(normalizedCountry)) {
    fieldErrors.country = 'Invalid country code'
  }

  const candidateCompany: SubscriptionCompanyIdentity = {
    ...existingCompany,
    ...updatePayload,
  }

  const requirements = resolveSubscriptionRequirements(candidateCompany)
  const requirementErrors = mapRequirementErrors(requirements)
  Object.assign(fieldErrors, requirementErrors.fieldErrors)

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors,
      formError: requirementErrors.formError,
    }
  }

  const { error: updateError } = await supabase
    .from('companies')
    .update(updatePayload)
    .eq('id', profile.company_id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const { company: updatedCompany, error: refetchError } = await loadCompanyIdentity(supabase, profile.company_id)
  if (refetchError || !updatedCompany) {
    return { success: false, error: refetchError ?? 'Company not found' }
  }

  revalidatePath('/settings')
  const state = buildState(updatedCompany, plans)

  if (requirementErrors.formError) {
    return {
      success: false,
      error: requirementErrors.formError,
      formError: requirementErrors.formError,
      state,
    }
  }

  return {
    success: true,
    state,
  }
}
