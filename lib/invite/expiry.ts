import 'server-only'

const DEFAULT_INVITE_EXPIRY_HOURS = 168

export function getInviteExpiryHours(): number {
  const configuredHours = Number(process.env.INVITE_EXPIRY_HOURS)
  if (!Number.isFinite(configuredHours) || configuredHours <= 0) {
    return DEFAULT_INVITE_EXPIRY_HOURS
  }

  return configuredHours
}

export function getInviteExpiresAt(from = new Date()): string {
  const expiresAtMs = from.getTime() + getInviteExpiryHours() * 60 * 60 * 1000
  return new Date(expiresAtMs).toISOString()
}

export function getInviteCookieMaxAgeSeconds(): number {
  return Math.round(getInviteExpiryHours() * 60 * 60)
}
