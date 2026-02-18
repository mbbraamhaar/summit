# Billing and Tax Policy

## Purpose

This document defines Summit's billing identity requirements and tax handling policy.  
It is authoritative for checkout prerequisites and invoice issuance rules for Summit subscriptions.  
It separates policy decisions from payment-provider implementation details.

## Canonical Rules

- Summit subscription sales are B2B only.
- Checkout requires required business and tax identity fields.
- Tax treatment depends on billing country and VAT/business-registration validation outcomes.
- Checkout must be blocked when mandatory validation fails.
- Subscription invoice generation occurs only after confirmed payment success.
- Subscription invoice date is the payment date.
- Subscription invoice period equals the paid subscription period.

## Tax Policy

- NL business customer:
  - Apply Dutch VAT per configured rate.
- EU (non-NL) business customer:
  - Reverse-charge policy when VAT ID validates via VIES.
  - VIES validation is required during checkout.
- Non-EU business customer:
  - Business registration format validation required.
  - VAT treatment follows configured non-EU B2B rules.

## Required Billing Fields

Required policy fields mapped to `companies`:
- VAT ID: `companies.tax_id`
- Business registration ID: `companies.company_registration_id`
- Billing country and address:
  - `companies.country`
  - `companies.address_line1`
  - `companies.address_line2` (optional)
  - `companies.city`
  - `companies.postal_code`

Additional invoice payment identity fields (when applicable):
- `companies.bank_account_name`
- `companies.bank_account_number`
- `companies.bank_bic`

## Checkout Gating Rules

- If required billing fields are missing, checkout is blocked.
- If EU reverse-charge path is selected and VIES validation fails, checkout is blocked.
- If non-EU business registration format check fails, checkout is blocked.
- Return URL arrival does not unlock access; only validated payment/webhook lifecycle updates do.

## Subscription Invoice Rules

- Generate invoice only after payment success is confirmed.
- Invoice issue date equals confirmed payment date.
- Invoice period start/end matches paid subscription period.
- No invoice is issued for failed or abandoned payment attempts.

## Data Dependencies

See `docs/database-schema.md` for canonical schema details.

Primary dependencies:
- `companies`: `tax_id`, `company_registration_id`, `country`, address fields, bank fields
- `subscriptions`: `company_id`, `plan_id`, period fields, status
- `plans`: price, interval, plan metadata
- Payment lifecycle events feeding entitlement/invoice issuance (documented in `docs/mollie-subscriptions.md`)

## Open Questions / Planned Work

Planned:
- Finalize explicit VAT rate configuration source and versioning approach.
- Define persistent audit trail for tax-validation outcomes at checkout.
- Define credit-note policy for refunds/chargebacks in subscription invoicing.

Open questions:
- Confirm legal-entity presentation and invoice numbering strategy for Summit seller invoices across jurisdictions.
- Confirm policy for mid-cycle plan changes and prorated tax treatment.
