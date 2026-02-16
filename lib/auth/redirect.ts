export function getSafeRedirectPath(redirect: string | null | undefined, fallback = '/dashboard') {
  if (!redirect) return fallback
  if (!redirect.startsWith('/')) return fallback
  if (redirect.startsWith('//')) return fallback
  return redirect
}
