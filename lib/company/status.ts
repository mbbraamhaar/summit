export type CompanyAccessMode = 'full' | 'read_only'

const FULL_ACCESS_STATUSES = new Set(['trial', 'active'])

export function getCompanyAccessModeFromStatus(status: string | null | undefined): CompanyAccessMode {
  if (!status) return 'read_only'
  return FULL_ACCESS_STATUSES.has(status) ? 'full' : 'read_only'
}

export function isCompanyReadOnlyStatus(status: string | null | undefined): boolean {
  return getCompanyAccessModeFromStatus(status) === 'read_only'
}
