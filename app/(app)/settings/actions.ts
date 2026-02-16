'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { sendInvitationEmail, sendMemberRemovedEmail } from '@/lib/email/invitations'

const deleteCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
})

const createInvitationSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid('Invalid invitation id'),
})

const removeMemberSchema = z.object({
  memberId: z.string().uuid('Invalid member id'),
})

function buildAuthRouteWithRedirect({
  appUrl,
  authPath,
  rawToken,
  email,
}: {
  appUrl: string
  authPath: '/auth/sign-in' | '/auth/sign-up'
  rawToken: string
  email: string
}) {
  const inviteAcceptPath = `/invite/accept?token=${encodeURIComponent(rawToken)}`
  const inviteUrl = new URL(authPath, appUrl)
  inviteUrl.searchParams.set('redirect', inviteAcceptPath)
  inviteUrl.searchParams.set('email', email)
  return inviteUrl.toString()
}

async function authUserExistsByEmail(email: string) {
  const admin = createAdminClient()
  const loweredEmail = email.toLowerCase()

  const maybeGetUserByEmail = (
    admin.auth.admin as unknown as {
      getUserByEmail?: (targetEmail: string) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>
    }
  ).getUserByEmail

  if (typeof maybeGetUserByEmail === 'function') {
    const { data, error } = await maybeGetUserByEmail(loweredEmail)
    if (error) {
      throw new Error(error.message)
    }
    return Boolean(data.user)
  }

  let page = 1
  const perPage = 200
  const maxPages = 50

  while (page <= maxPages) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(error.message)
    }

    if (data.users.some((candidate) => candidate.email?.toLowerCase() === loweredEmail)) {
      return true
    }

    if (data.users.length < perPage) {
      break
    }

    page += 1
  }

  return false
}

export async function updateCompany(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can edit company settings' }
  }

  const name = formData.get('name') as string
  const tax_id = formData.get('tax_id') as string
  const address_line1 = formData.get('address_line1') as string
  const city = formData.get('city') as string
  const postal_code = formData.get('postal_code') as string
  const country = formData.get('country') as string
  const bank_account_name = formData.get('bank_account_name') as string
  const bank_account_number = formData.get('bank_account_number') as string

  if (!name || !tax_id || !address_line1 || !city || !postal_code || !country || !bank_account_name || !bank_account_number) {
    return { success: false, error: 'All required fields must be filled' }
  }

  const company_registration_id = formData.get('company_registration_id') as string | null
  const address_line2 = formData.get('address_line2') as string | null
  const bank_bic = formData.get('bank_bic') as string | null

  const { error } = await supabase
    .from('companies')
    .update({
      name,
      company_registration_id,
      tax_id,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      bank_account_name,
      bank_account_number,
      bank_bic,
    })
    .eq('id', profile.company_id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function deleteCompany(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      role,
      company_id,
      company:companies(name)
    `)
    .eq('id', user.id)
    .single()

  if (!profile || !profile.company) {
    return { success: false, error: 'Profile or company not found' }
  }

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can delete the company' }
  }

  const companyName = formData.get('companyName') as string
  const validation = deleteCompanySchema.safeParse({ companyName })
  if (!validation.success) {
    return { success: false, error: 'Company name is required' }
  }

  if (companyName !== profile.company.name) {
    return { success: false, error: 'Company name does not match' }
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', profile.company_id)

  if (error) {
    return { success: false, error: error.message }
  }

  await supabase.auth.signOut()
  redirect('/')
}

export async function createInvitation(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select(`
      id,
      role,
      company_id,
      company:companies(name)
    `)
    .eq('id', user.id)
    .single()

  if (!ownerProfile || !ownerProfile.company) {
    return { success: false, error: 'Profile or company not found' }
  }

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can invite members' }
  }

  const rawEmail = (formData.get('email') as string | null) ?? ''
  const validation = createInvitationSchema.safeParse({ email: rawEmail })

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message ?? 'Invalid email' }
  }

  const email = validation.data.email.toLowerCase().trim()

  if (email === user.email?.toLowerCase()) {
    return { success: false, error: 'You cannot invite yourself' }
  }

  const { data: existingMember } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', ownerProfile.company_id)
    .eq('email', email)
    .maybeSingle()

  if (existingMember) {
    return { success: false, error: 'This user is already a member of your company' }
  }

  let hasAuthAccount = false

  try {
    hasAuthAccount = await authUserExistsByEmail(email)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process invitation',
    }
  }

  const { error: revokePendingError } = await supabase
    .from('invitations')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('company_id', ownerProfile.company_id)
    .eq('status', 'pending')
    .eq('email', email)

  if (revokePendingError) {
    return { success: false, error: revokePendingError.message }
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const inviteExpiryHours = Number(process.env.INVITE_EXPIRY_HOURS || '168')
  const expiresAt = new Date(Date.now() + inviteExpiryHours * 60 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase
    .from('invitations')
    .insert({
      company_id: ownerProfile.company_id,
      email,
      token_hash: tokenHash,
      invited_by: ownerProfile.id,
      expires_at: expiresAt,
      status: 'pending',
    })

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const inviteUrl = buildAuthRouteWithRedirect({
    appUrl,
    authPath: hasAuthAccount ? '/auth/sign-in' : '/auth/sign-up',
    rawToken,
    email,
  })

  const emailResult = await sendInvitationEmail({
    toEmail: email,
    companyName: ownerProfile.company.name,
    inviteUrl,
    expiresAt,
    variant: hasAuthAccount ? 'reactivated' : 'new-invite',
  })

  if (!emailResult.success) {
    return {
      success: false,
      error: emailResult.error || 'Invitation was created, but the email could not be sent',
    }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function revokeInvitation(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select(`
      role,
      company_id,
      company:companies(name)
    `)
    .eq('id', user.id)
    .single()

  if (!ownerProfile) {
    return { success: false, error: 'Profile not found' }
  }

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can revoke invitations' }
  }

  const invitationId = (formData.get('invitationId') as string | null) ?? ''
  const validation = revokeInvitationSchema.safeParse({ invitationId })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message ?? 'Invalid invitation id' }
  }

  const { data: updatedInvitation, error } = await supabase
    .from('invitations')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', validation.data.invitationId)
    .eq('company_id', ownerProfile.company_id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!updatedInvitation) {
    return { success: false, error: 'Invitation not found or already processed' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function removeMember(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select(`
      role,
      company_id,
      company:companies(name)
    `)
    .eq('id', user.id)
    .single()

  if (!ownerProfile) {
    return { success: false, error: 'Profile not found' }
  }

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can remove members' }
  }

  const memberId = (formData.get('memberId') as string | null) ?? ''
  const validation = removeMemberSchema.safeParse({ memberId })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message ?? 'Invalid member id' }
  }

  if (validation.data.memberId === user.id) {
    return { success: false, error: 'You cannot remove yourself' }
  }

  const { data: memberToRemove, error: memberError } = await supabase
    .from('profiles')
    .select('id, role, email')
    .eq('id', validation.data.memberId)
    .eq('company_id', ownerProfile.company_id)
    .maybeSingle()

  if (memberError) {
    return { success: false, error: memberError.message }
  }

  if (!memberToRemove) {
    return { success: false, error: 'Member not found' }
  }

  if (memberToRemove.role === 'owner') {
    return { success: false, error: 'Owners cannot be removed' }
  }

  const { error: deleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', validation.data.memberId)
    .eq('company_id', ownerProfile.company_id)

  if (deleteError) {
    return { success: false, error: deleteError.message }
  }

  const companyName = ownerProfile.company?.name || 'your workspace'
  const removalEmailResult = await sendMemberRemovedEmail({
    toEmail: memberToRemove.email,
    companyName,
  })

  if (!removalEmailResult.success) {
    console.error('Failed to send member removal email:', removalEmailResult.error)
  }

  revalidatePath('/settings')
  return { success: true }
}
