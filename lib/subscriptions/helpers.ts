import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type CompanyAccessMode = 'full' | 'read_only'
export type CompanyBillingState = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const FULL_ACCESS_STATUSES = new Set<CompanyBillingState>(['trial', 'active'])

function normalizeBillingState(status: string | null | undefined): CompanyBillingState {
  if (
    status === 'trial' ||
    status === 'active' ||
    status === 'past_due' ||
    status === 'suspended' ||
    status === 'canceled'
  ) {
    return status
  }

  return 'suspended'
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === 'string') {
    return Date.parse(value)
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  return Number.NaN
}

export async function getCompanyEntitlement(supabase: SupabaseClient, companyId: string) {
  const { data: company, error } = await supabase
    .from('companies')
    .select('status, trial_ends_at')
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!company) {
    throw new Error('Company not found')
  }

  const status = normalizeBillingState(company.status)
  const trialEndsAt = company.trial_ends_at
  const trialEndsAtMs = parseTimestampMs(trialEndsAt)
  const isTrialExpired =
    status === 'trial' &&
    Number.isFinite(trialEndsAtMs) &&
    Date.now() > trialEndsAtMs
  const accessMode: CompanyAccessMode = FULL_ACCESS_STATUSES.has(status) && !isTrialExpired
    ? 'full'
    : 'read_only'

  return {
    status,
    accessMode,
    isTrialExpired,
    trialEndsAt,
  }
}

export async function requireWriteAccess(supabase: SupabaseClient, companyId: string): Promise<void> {
  const entitlement = await getCompanyEntitlement(supabase, companyId)

  if (entitlement.accessMode !== 'full') {
    throw new Error('WORKSPACE_READ_ONLY')
  }
}
