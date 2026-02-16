'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
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

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
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

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
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
