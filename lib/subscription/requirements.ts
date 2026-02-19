import { type Tables } from '@/types/database'

export type RequirementKey =
  | 'COUNTRY'
  | 'STREET_ADDRESS'
  | 'CITY'
  | 'POSTAL_CODE'
  | 'VAT_ID'
  | 'BUSINESS_REGISTRATION_ID'
  | 'VIES_VALIDATION'

export type Requirement = {
  key: RequirementKey
  title: string
  description?: string
  fields: string[]
  blocking_reason: string
}

type SubscriptionCompany = Pick<
  Tables<'companies'>,
  'country' | 'street_address' | 'city' | 'postal_code' | 'tax_id' | 'company_registration_id'
>

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
])

const NL_VAT_REGEX = /^NL[0-9]{9}B[0-9]{2}$/i
const EU_VAT_REGEX = /^([A-Z]{2})([A-Z0-9]{6,14})$/i
const BUSINESS_REGISTRATION_REGEX = /^[A-Z0-9\-_\/]+$/

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function isValidBusinessRegistrationId(value: string) {
  if (value.length < 6 || value.length > 32) {
    return false
  }

  if (/\s/.test(value)) {
    return false
  }

  return BUSINESS_REGISTRATION_REGEX.test(value)
}

export function resolveSubscriptionRequirements(company: SubscriptionCompany) {
  const ordered_requirements: Requirement[] = []
  const normalizedCountry = normalizeString(company.country).toUpperCase()

  if (!normalizedCountry) {
    ordered_requirements.push({
      key: 'COUNTRY',
      title: 'Billing country',
      description: 'Required to continue',
      fields: ['country'],
      blocking_reason: 'MISSING_COUNTRY',
    })

    return {
      ordered_requirements,
      is_ready: false,
      derived: {
        is_nl: false,
        is_eu_non_nl: false,
        is_non_eu: false,
      },
    }
  }

  const is_nl = normalizedCountry === 'NL'
  const is_eu_non_nl = normalizedCountry !== 'NL' && EU_COUNTRY_CODES.has(normalizedCountry)
  const is_non_eu = !EU_COUNTRY_CODES.has(normalizedCountry)

  if (!normalizeString(company.street_address)) {
    ordered_requirements.push({
      key: 'STREET_ADDRESS',
      title: 'Street address',
      description: 'Required to continue',
      fields: ['street_address'],
      blocking_reason: 'MISSING_STREET_ADDRESS',
    })
  }

  if (!normalizeString(company.city)) {
    ordered_requirements.push({
      key: 'CITY',
      title: 'City',
      description: 'Required to continue',
      fields: ['city'],
      blocking_reason: 'MISSING_CITY',
    })
  }

  if (!normalizeString(company.postal_code)) {
    ordered_requirements.push({
      key: 'POSTAL_CODE',
      title: 'Postal code',
      description: 'Required to continue',
      fields: ['postal_code'],
      blocking_reason: 'MISSING_POSTAL_CODE',
    })
  }

  if (is_nl || is_eu_non_nl) {
    const taxId = normalizeString(company.tax_id).toUpperCase()

    if (!taxId) {
      ordered_requirements.push({
        key: 'VAT_ID',
        title: 'VAT ID',
        description: 'Required to continue',
        fields: ['tax_id'],
        blocking_reason: 'MISSING_VAT_ID',
      })
    } else {
      const vatFormatIsValid = is_nl
        ? NL_VAT_REGEX.test(taxId)
        : EU_VAT_REGEX.test(taxId)

      if (!vatFormatIsValid) {
        ordered_requirements.push({
          key: 'VAT_ID',
          title: 'VAT ID',
          description: 'Required to continue',
          fields: ['tax_id'],
          blocking_reason: 'INVALID_VAT_ID_FORMAT',
        })
      }
    }

    if (is_eu_non_nl) {
      ordered_requirements.push({
        key: 'VIES_VALIDATION',
        title: 'VAT validation',
        description: 'VAT validation required',
        fields: ['tax_id'],
        // TODO(Slice 2): implement VIES validation check + persistence and remove unconditional block.
        blocking_reason: 'REQUIRES_VIES_VALIDATION',
      })
    }
  }

  if (is_non_eu) {
    const registrationId = normalizeString(company.company_registration_id)

    if (!registrationId) {
      ordered_requirements.push({
        key: 'BUSINESS_REGISTRATION_ID',
        title: 'Business registration ID',
        description: 'Required to continue',
        fields: ['company_registration_id'],
        blocking_reason: 'MISSING_BUSINESS_REGISTRATION_ID',
      })
    } else if (!isValidBusinessRegistrationId(registrationId)) {
      ordered_requirements.push({
        key: 'BUSINESS_REGISTRATION_ID',
        title: 'Business registration ID',
        description: 'Required to continue',
        fields: ['company_registration_id'],
        blocking_reason: 'INVALID_BUSINESS_REGISTRATION_FORMAT',
      })
    }
  }

  return {
    ordered_requirements,
    is_ready: ordered_requirements.length === 0,
    derived: {
      is_nl,
      is_eu_non_nl,
      is_non_eu,
    },
  }
}
