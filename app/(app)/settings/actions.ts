'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileOrRedirect } from '@/lib/auth/require-profile'
import { getCompanyEntitlement, requireWriteAccess } from '@/lib/subscriptions/helpers'
import { revalidatePath } from 'next/cache'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { sendInvitationEmail, sendMemberRemovedEmail } from '@/lib/email/invitations'
import { getInviteExpiresAt } from '@/lib/invite/expiry'

const closeWorkspaceSchema = z.object({
  confirmation: z.literal('CLOSE'),
})

const createInvitationSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid('Invalid invitation id'),
})

const resendInvitationSchema = z.object({
  invitationId: z.string().uuid('Invalid invitation id'),
})

const removeMemberSchema = z.object({
  memberId: z.string().uuid('Invalid member id'),
})

function isAlreadyDeletedAuthUserError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('user not found')
}

async function getInvitationAccessError(
  supabase: Awaited<ReturnType<typeof getProfileOrRedirect>>['supabase'],
  companyId: string,
) {
  const entitlement = await getCompanyEntitlement(supabase, companyId)
  const isAllowedStatus = entitlement.status === 'trial'
    || entitlement.status === 'active'
    || entitlement.status === 'past_due'
    || entitlement.status === 'suspended'

  if (!isAllowedStatus || entitlement.isTrialExpired) {
    return 'WORKSPACE_READ_ONLY'
  }

  return null
}

export async function updateCompany(formData: FormData) {
  const { supabase, profile } = await getProfileOrRedirect()

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can edit company settings' }
  }

  try {
    await requireWriteAccess(supabase, profile.company_id)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'WORKSPACE_READ_ONLY' }
  }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const tax_id = formData.get('tax_id') as string
  const address_line1 = formData.get('address_line1') as string
  const city = formData.get('city') as string
  const postal_code = formData.get('postal_code') as string
  const country = formData.get('country') as string
  const bank_account_name = formData.get('bank_account_name') as string
  const bank_account_number = formData.get('bank_account_number') as string

  if (!name) {
    return { success: false, error: 'Company name is required' }
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

export async function closeWorkspace(formData: FormData) {
  const { supabase, profile } = await getProfileOrRedirect()

  if (!profile.company) {
    return { success: false, error: 'Profile or company not found' }
  }

  if (profile.role !== 'owner') {
    return { success: false, error: 'Only owners can close the workspace' }
  }

  const confirmation = (formData.get('confirmation') as string | null) ?? ''
  const validation = closeWorkspaceSchema.safeParse({ confirmation })
  if (!validation.success) {
    return { success: false, error: 'Type CLOSE to confirm' }
  }

  const { data: company, error: companyLoadError } = await supabase
    .from('companies')
    .select('status')
    .eq('id', profile.company_id)
    .maybeSingle()

  if (companyLoadError) {
    return { success: false, error: companyLoadError.message }
  }

  if (!company) {
    return { success: false, error: 'Company not found' }
  }

  if (company.status === 'canceled') {
    return { success: true }
  }

  const { error } = await supabase
    .from('companies')
    .update({ status: 'canceled' })
    .eq('id', profile.company_id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function createInvitation(formData: FormData) {
  const { supabase, user, profile: ownerProfile } = await getProfileOrRedirect()

  if (!ownerProfile.company) {
    return { success: false, error: 'Profile or company not found' }
  }

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can invite members' }
  }

  const invitationAccessError = await getInvitationAccessError(supabase, ownerProfile.company_id)
  if (invitationAccessError) {
    return { success: false, error: invitationAccessError }
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

  const { data: existingPendingInvite, error: existingPendingInviteError } = await supabase
    .from('invitations')
    .select('id')
    .eq('company_id', ownerProfile.company_id)
    .eq('status', 'pending')
    .eq('email', email)
    .maybeSingle()

  if (existingPendingInviteError) {
    return { success: false, error: existingPendingInviteError.message }
  }

  if (existingPendingInvite) {
    return { success: false, error: 'A pending invitation already exists. Use resend.' }
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = getInviteExpiresAt()

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

  const inviteUrl = `${appUrl}/invite?token=${encodeURIComponent(rawToken)}`

  const emailResult = await sendInvitationEmail({
    toEmail: email,
    companyName: ownerProfile.company.name,
    inviteUrl,
    expiresAt,
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

export async function resendInvitation(formData: FormData) {
  const { supabase, profile: ownerProfile } = await getProfileOrRedirect()

  if (!ownerProfile.company) {
    return { success: false, error: 'Profile or company not found' }
  }

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can resend invitations' }
  }

  const invitationAccessError = await getInvitationAccessError(supabase, ownerProfile.company_id)
  if (invitationAccessError) {
    return { success: false, error: invitationAccessError }
  }

  const invitationId = (formData.get('invitationId') as string | null) ?? ''
  const validation = resendInvitationSchema.safeParse({ invitationId })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message ?? 'Invalid invitation id' }
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = getInviteExpiresAt()

  const { data: updatedInvitation, error: updateError } = await supabase
    .from('invitations')
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: 'pending',
      accepted_at: null,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', validation.data.invitationId)
    .eq('company_id', ownerProfile.company_id)
    .in('status', ['pending', 'expired'])
    .select('id, email, expires_at')
    .maybeSingle()

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  if (!updatedInvitation) {
    const { data: invitation, error: invitationError } = await supabase
      .from('invitations')
      .select('status')
      .eq('id', validation.data.invitationId)
      .eq('company_id', ownerProfile.company_id)
      .maybeSingle()

    if (invitationError) {
      return { success: false, error: invitationError.message }
    }

    if (!invitation) {
      return { success: false, error: 'Invitation not found' }
    }

    if (invitation.status === 'accepted') {
      return { success: false, error: 'Accepted invitations cannot be resent' }
    }

    if (invitation.status === 'revoked') {
      return { success: false, error: 'Revoked invitations cannot be resent' }
    }

    return { success: false, error: 'Invitation is no longer eligible for resend' }
  }

  console.info('invitation_resent', {
    invitationId: updatedInvitation.id,
    companyId: ownerProfile.company_id,
    resentBy: ownerProfile.id,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/invite?token=${encodeURIComponent(rawToken)}`

  const emailResult = await sendInvitationEmail({
    toEmail: updatedInvitation.email,
    companyName: ownerProfile.company.name,
    inviteUrl,
    expiresAt: updatedInvitation.expires_at,
  })

  if (!emailResult.success) {
    return {
      success: false,
      error: emailResult.error || 'Invitation was resent, but the email could not be sent',
    }
  }

  revalidatePath('/settings')
  return { success: true, expiresAt: updatedInvitation.expires_at }
}

export async function revokeInvitation(formData: FormData) {
  const { supabase, profile: ownerProfile } = await getProfileOrRedirect()

  if (ownerProfile.role !== 'owner') {
    return { success: false, error: 'Only owners can revoke invitations' }
  }

  const invitationAccessError = await getInvitationAccessError(supabase, ownerProfile.company_id)
  if (invitationAccessError) {
    return { success: false, error: invitationAccessError }
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
  const { supabase, user, profile: ownerProfile } = await getProfileOrRedirect()
  const admin = createAdminClient()

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
    const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(validation.data.memberId)
    if (deleteAuthUserError && !isAlreadyDeletedAuthUserError(deleteAuthUserError)) {
      console.error('Unexpected error deleting missing auth user', {
        actorId: user.id,
        memberId: validation.data.memberId,
        message: deleteAuthUserError.message,
      })
      return { success: false, error: deleteAuthUserError.message }
    }
    revalidatePath('/settings')
    return { success: true }
  }

  if (memberToRemove.role === 'owner') {
    return { success: false, error: 'Owners cannot be removed' }
  }

  const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(validation.data.memberId)

  if (deleteAuthUserError && !isAlreadyDeletedAuthUserError(deleteAuthUserError)) {
    console.error('Unexpected error deleting auth user', {
      actorId: user.id,
      memberId: validation.data.memberId,
      message: deleteAuthUserError.message,
    })
    return { success: false, error: deleteAuthUserError.message }
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
