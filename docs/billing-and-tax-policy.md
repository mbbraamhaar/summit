# Billing and Tax Policy

**Last Updated:** February 20, 2026  
**Scope:** Checkout prerequisites, tax enforcement boundaries, and invoice policy

## Purpose

This document is authoritative for:
- Checkout gating policy and what is actually enforced today.
- Tax-validation enforcement boundaries (current vs planned).
- Invoice issuance timing and period rules.

For lifecycle state-machine behavior, see `docs/subscription-lifecycle.md`.

## Canonical Rules

- Summit subscription sales are B2B-oriented.
- Payment/subscription truth comes from webhook processing, not return URLs.
- Invoice issuance is payment-confirmation driven.
- Tax checks must not be described as enforced unless they are implemented in server-side checkout logic.

## Current Checkout Enforcement (Implemented)

At `POST /api/billing/checkout/start`, server-side enforcement currently includes:
- Authenticated session required.
- Owner role required.
- Requested plan must exist and be active.
- Active-subscription conflict protection (cannot start this flow when an active subscription already exists).
- Billing environment configuration required (Mollie + app URL/secret wiring).

Current non-enforcement:
- No VIES lookup is performed in server checkout start.
- No hard-blocking tax-ID/business-registration validation is enforced in server checkout start.
- No country-specific tax-path enforcement is currently blocking checkout.

## Current vs Planned Enforcement

Current (implemented):
- Checkout is gated by auth/role/plan/subscription-state rules.
- Tax identity fields are not currently hard-blocking in server checkout start.

Planned (not yet enforced in current server checkout flow):
- Required billing identity presence checks at checkout.
- Format validation for tax/business registration identifiers.
- Optional/conditional VIES validation workflow for EU reverse-charge eligibility.
- Persisted audit trail of tax-validation outcomes.

## Tax Policy Intent (Business)

Policy intent remains:
- NL business customer: Dutch VAT applies.
- EU non-NL business customer: reverse-charge only when VAT validation criteria are met.
- Non-EU business customer: tax treatment follows configured non-EU B2B policy.

Implementation note:
- These tax-path rules should be treated as policy targets until fully implemented in checkout and invoice generation code.

## Subscription Invoice Rules

- Invoice is generated only after confirmed successful payment.
- Invoice issue date equals payment date.
- Invoice billing period equals the paid subscription period (`current_period_start` to `current_period_end` from subscription lifecycle transitions).
- Failed/expired/canceled payment attempts do not generate invoices.

## Data Dependencies

Primary tables:
- `companies` for billing identity fields (`tax_id`, `company_registration_id`, address, bank metadata).
- `subscriptions` for period and status lifecycle.
- `subscription_payment_attempts` for payment-attempt evidence.

## Related Docs

- `docs/subscription-lifecycle.md` (canonical lifecycle/invariants)
- `docs/mollie-subscriptions.md` (provider integration behavior)
- `docs/database-schema.md` (schema and function reference)
