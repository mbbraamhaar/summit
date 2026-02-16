export const AVATAR_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export function isAvatarUploadEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_AVATAR_UPLOAD === 'true'
}

export function getAvatarPlaceholderMessage() {
  if (isAvatarUploadEnabled()) {
    return 'Avatar upload wiring is enabled, storage integration is coming next.'
  }

  return 'Avatar upload is coming soon.'
}
