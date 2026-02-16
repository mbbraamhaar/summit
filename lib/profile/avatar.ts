export const AVATAR_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export function isAvatarUploadEnabled() {
  return true
}

export function getAvatarPlaceholderMessage() {
  return 'Upload a JPG, PNG, or WebP image up to 2MB.'
}

export function getAvatarExtensionFromMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

export function getAvatarInitials(fullName: string | null, email: string): string {
  const trimmedName = (fullName ?? '').trim()
  if (trimmedName.length > 0) {
    const parts = trimmedName.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }

  const emailPrefix = email.split('@')[0] ?? ''
  return emailPrefix.slice(0, 2).toUpperCase() || 'U'
}
