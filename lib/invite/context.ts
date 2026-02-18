import 'server-only'

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export interface InviteContext {
  companyId: string
  email: string
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function getPendingInviteContext(token: string): Promise<InviteContext | null> {
  if (!token) {
    return null
  }

  const admin = createAdminClient()
  const tokenHash = hashInviteToken(token)
  const { data: invitation, error } = await admin
    .from('invitations')
    .select('company_id, email, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !invitation) {
    return null
  }

  if (invitation.status !== 'pending') {
    return null
  }

  if (Date.parse(invitation.expires_at) <= Date.now()) {
    return null
  }

  return {
    companyId: invitation.company_id,
    email: invitation.email,
  }
}
