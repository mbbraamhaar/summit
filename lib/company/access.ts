import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  getCompanyEntitlement,
  requireWriteAccess as requireSubscriptionWriteAccess,
  type CompanyAccessMode,
} from '@/lib/subscriptions/helpers'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getCompanyAccessMode(companyId: string, supabase?: SupabaseClient): Promise<CompanyAccessMode> {
  const client = supabase ?? await createClient()
  const entitlement = await getCompanyEntitlement(client, companyId)
  return entitlement.accessMode
}

export async function requireWriteAccess(companyId: string, supabase?: SupabaseClient): Promise<void> {
  const client = supabase ?? await createClient()
  await requireSubscriptionWriteAccess(client, companyId)
}
