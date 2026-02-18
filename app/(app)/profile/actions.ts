'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWriteAccess } from '@/lib/subscriptions/helpers'
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_FILE_SIZE_BYTES,
  getAvatarExtensionFromMimeType,
} from '@/lib/profile/avatar'

const updateProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
})

const requestEmailChangeSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address'),
})

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function buildEmailChangeCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const callbackUrl = new URL('/auth/email-change/callback', appUrl)
  callbackUrl.searchParams.set('redirect', '/profile')
  return callbackUrl.toString()
}

async function getUserCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return { companyId: null, error: error.message }
  }

  if (!profile) {
    return { companyId: null, error: 'Profile not found' }
  }

  return { companyId: profile.company_id, error: null }
}

async function getUserProfileEmails(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('email, pending_email')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return { profile: null, error: error.message }
  }

  if (!profile) {
    return { profile: null, error: 'Profile not found' }
  }

  return { profile, error: null }
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { companyId, error: profileError } = await getUserCompanyId(supabase, user.id)
  if (profileError || !companyId) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  try {
    await requireWriteAccess(supabase, companyId)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'WORKSPACE_READ_ONLY' }
  }

  const fullName = (formData.get('full_name') as string | null) ?? ''
  const validation = updateProfileSchema.safeParse({ full_name: fullName })

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? 'Invalid profile data',
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: validation.data.full_name })
    .eq('id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function requestEmailChange(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const email = (formData.get('email') as string | null) ?? ''
  const validation = requestEmailChangeSchema.safeParse({ email })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message ?? 'Invalid email address' }
  }

  const nextEmail = normalizeEmail(validation.data.email)
  const currentAuthEmail = normalizeEmail(user.email ?? '')

  if (!currentAuthEmail) {
    return { success: false, error: 'Current account email is unavailable' }
  }

  if (nextEmail === currentAuthEmail) {
    return { success: false, error: 'Please enter a different email address' }
  }

  const { error: profileError } = await getUserProfileEmails(supabase, user.id)
  if (profileError) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  const { data: existingEmailOwner, error: existingEmailOwnerError } = await supabase
    .from('profiles')
    .select('id')
    .neq('id', user.id)
    .eq('email', nextEmail)
    .maybeSingle()

  if (existingEmailOwnerError) {
    return { success: false, error: existingEmailOwnerError.message }
  }

  if (existingEmailOwner) {
    return { success: false, error: 'This email address is already in use' }
  }

  const { data: existingPendingOwner, error: existingPendingOwnerError } = await supabase
    .from('profiles')
    .select('id')
    .neq('id', user.id)
    .eq('pending_email', nextEmail)
    .maybeSingle()

  if (existingPendingOwnerError) {
    return { success: false, error: existingPendingOwnerError.message }
  }

  if (existingPendingOwner) {
    return { success: false, error: 'This email address is already in use' }
  }

  const callbackUrl = buildEmailChangeCallbackUrl()
  const { error: updateAuthError } = await supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: callbackUrl }
  )

  if (updateAuthError) {
    return { success: false, error: updateAuthError.message }
  }

  const nowIso = new Date().toISOString()
  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({
      pending_email: nextEmail,
      pending_email_requested_at: nowIso,
      pending_email_verification_sent_at: nowIso,
    })
    .eq('id', user.id)

  if (updateProfileError) {
    return { success: false, error: updateProfileError.message }
  }

  revalidatePath('/profile')
  return { success: true, pendingEmail: nextEmail }
}

export async function resendEmailChangeVerification() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { profile, error: profileError } = await getUserProfileEmails(supabase, user.id)
  if (profileError || !profile) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  const pendingEmail = profile.pending_email ? normalizeEmail(profile.pending_email) : ''
  if (!pendingEmail) {
    return { success: false, error: 'No pending email change found' }
  }

  const callbackUrl = buildEmailChangeCallbackUrl()
  const { error: updateAuthError } = await supabase.auth.updateUser(
    { email: pendingEmail },
    { emailRedirectTo: callbackUrl }
  )

  if (updateAuthError) {
    return { success: false, error: updateAuthError.message }
  }

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({ pending_email_verification_sent_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateProfileError) {
    return { success: false, error: updateProfileError.message }
  }

  revalidatePath('/profile')
  return { success: true }
}

export async function cancelEmailChange() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { profile, error: profileError } = await getUserProfileEmails(supabase, user.id)
  if (profileError || !profile) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  const currentEmail = normalizeEmail(profile.email)
  const pendingEmail = profile.pending_email ? normalizeEmail(profile.pending_email) : ''

  if (!pendingEmail) {
    return { success: true }
  }

  const admin = createAdminClient()
  const { error: adminError } = await admin.auth.admin.updateUserById(user.id, {
    email: currentEmail,
    email_confirm: true,
  })

  if (adminError) {
    return { success: false, error: adminError.message }
  }

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({
      pending_email: null,
      pending_email_requested_at: null,
      pending_email_verification_sent_at: null,
    })
    .eq('id', user.id)

  if (updateProfileError) {
    return { success: false, error: updateProfileError.message }
  }

  revalidatePath('/profile')
  return { success: true }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { companyId, error: profileError } = await getUserCompanyId(supabase, user.id)
  if (profileError || !companyId) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  try {
    await requireWriteAccess(supabase, companyId)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'WORKSPACE_READ_ONLY' }
  }

  const file = formData.get('avatar')
  if (!(file instanceof File)) {
    return { success: false, error: 'Please select an image file' }
  }

  if (file.size <= 0) {
    return { success: false, error: 'Selected file is empty' }
  }

  if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'Avatar must be 2MB or smaller' }
  }

  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
    return { success: false, error: 'Only JPG, PNG, and WebP files are allowed' }
  }

  const extension = getAvatarExtensionFromMimeType(file.type)
  if (!extension) {
    return { success: false, error: 'Unsupported image type' }
  }

  const objectKey = `${user.id}/avatar.${extension}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(objectKey, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    return { success: false, error: uploadError.message }
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(objectKey)

  const avatarUrl = publicUrlData.publicUrl
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')

  return { success: true, avatar_url: avatarUrl }
}

export async function removeAvatar() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { companyId, error: profileError } = await getUserCompanyId(supabase, user.id)
  if (profileError || !companyId) {
    return { success: false, error: profileError ?? 'Profile not found' }
  }

  try {
    await requireWriteAccess(supabase, companyId)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'WORKSPACE_READ_ONLY' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')

  return { success: true }
}
