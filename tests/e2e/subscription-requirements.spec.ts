import { expect, test } from '@playwright/test'
import { resolveSubscriptionRequirements } from '@/lib/subscription/requirements'

const completeAddress = {
  street_address: 'Keizersgracht 1',
  city: 'Amsterdam',
  postal_code: '1015CJ',
}

test('missing country returns only COUNTRY requirement', () => {
  const result = resolveSubscriptionRequirements({
    country: null,
    street_address: null,
    city: null,
    postal_code: null,
    tax_id: null,
    company_registration_id: null,
  })

  expect(result.is_ready).toBe(false)
  expect(result.ordered_requirements).toHaveLength(1)
  expect(result.ordered_requirements[0]?.key).toBe('COUNTRY')
  expect(result.ordered_requirements[0]?.blocking_reason).toBe('MISSING_COUNTRY')
})

test('country set with missing address returns address requirements', () => {
  const result = resolveSubscriptionRequirements({
    country: 'US',
    street_address: null,
    city: null,
    postal_code: null,
    tax_id: null,
    company_registration_id: 'US-ABC123',
  })

  expect(result.is_ready).toBe(false)
  expect(result.ordered_requirements.map((requirement) => requirement.blocking_reason)).toEqual([
    'MISSING_STREET_ADDRESS',
    'MISSING_CITY',
    'MISSING_POSTAL_CODE',
  ])
})

test('NL VAT is required and invalid format blocks', () => {
  const missingVat = resolveSubscriptionRequirements({
    country: 'NL',
    ...completeAddress,
    tax_id: null,
    company_registration_id: null,
  })

  const invalidVat = resolveSubscriptionRequirements({
    country: 'NL',
    ...completeAddress,
    tax_id: 'NL123',
    company_registration_id: null,
  })

  expect(missingVat.is_ready).toBe(false)
  expect(missingVat.ordered_requirements.map((requirement) => requirement.blocking_reason)).toEqual(['MISSING_VAT_ID'])

  expect(invalidVat.is_ready).toBe(false)
  expect(invalidVat.ordered_requirements.map((requirement) => requirement.blocking_reason)).toEqual(['INVALID_VAT_ID_FORMAT'])
})

test('NL VAT valid and address complete returns ready', () => {
  const result = resolveSubscriptionRequirements({
    country: 'NL',
    ...completeAddress,
    tax_id: 'NL123456789B01',
    company_registration_id: null,
  })

  expect(result.is_ready).toBe(true)
  expect(result.ordered_requirements).toEqual([])
})

test('EU non-NL VAT format valid and address complete returns ready', () => {
  const result = resolveSubscriptionRequirements({
    country: 'DE',
    ...completeAddress,
    tax_id: 'DE123456789',
    company_registration_id: null,
  })

  expect(result.is_ready).toBe(true)
  expect(result.ordered_requirements).toEqual([])
})

test('non-EU requires business registration and invalid format blocks', () => {
  const missingRegistration = resolveSubscriptionRequirements({
    country: 'US',
    ...completeAddress,
    tax_id: null,
    company_registration_id: null,
  })

  const invalidRegistration = resolveSubscriptionRequirements({
    country: 'US',
    ...completeAddress,
    tax_id: null,
    company_registration_id: 'US 123',
  })

  expect(missingRegistration.is_ready).toBe(false)
  expect(missingRegistration.ordered_requirements.map((requirement) => requirement.blocking_reason)).toEqual([
    'MISSING_BUSINESS_REGISTRATION_ID',
  ])

  expect(invalidRegistration.is_ready).toBe(false)
  expect(invalidRegistration.ordered_requirements.map((requirement) => requirement.blocking_reason)).toEqual([
    'INVALID_BUSINESS_REGISTRATION_FORMAT',
  ])
})
