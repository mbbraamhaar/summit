# Mollie Subscriptions

**Last Updated:** February 20, 2026  
**Scope:** Mollie provider integration details for Summit billing

For canonical lifecycle states, transitions, and invariants, see `docs/subscription-lifecycle.md`.

## Integration Pattern

Summit uses the Mollie mandate-safe flow:
1. Create/reuse Mollie customer (`mollie_customer_id`).
2. Create first payment (`sequenceType=first`) and redirect user to checkout.
3. On first payment `paid` webhook, create recurring Mollie subscription (`mollie_subscription_id`) with `startDate` set to the next period start (`YYYY-MM-DD` from `current_period_end` in UTC).
4. Process all renewals from webhook payment events (`sequenceType=recurring`).

## Webhook Authority

- `POST /api/mollie/webhook` is authoritative for payment status.
- Handler accepts payment ID from:
  - form payload (`application/x-www-form-urlencoded`, `id=tr_xxx`)
  - JSON payload (`{ "id": "tr_xxx" }`)
  - query fallback (`?id=tr_xxx`)
- Handler validates webhook secret from query param against `MOLLIE_WEBHOOK_SECRET`.

## Correlation Rules

First payment activation correlation:
- Requires payment metadata `subscriptionId` and `companyId`.
- Requires customer correlation (`payment.customerId` aligned to subscription customer link).
- Validates charged amount and currency against selected plan.

Recurring correlation:
- Does not require metadata.
- Requires `payment.customerId`.
- Resolves subscription via `subscriptions.mollie_customer_id`.
- Requires exactly one match; zero or multiple matches are skip conditions.
- If payment includes Mollie `subscriptionId`, cross-check against `subscriptions.mollie_subscription_id` when present.

## Idempotency Model

Mollie-side:
- First-payment activation creates recurring subscription with an idempotency key.
- Plan-change PATCH uses idempotency key.

Database-side:
- `subscription_payment_attempts.mollie_payment_id` is unique.
- `subscription_payment_attempts.processed_at` is the recurring-processing idempotency anchor.
- Duplicate/replayed recurring webhooks return no-op semantics (`already_processed`).

## Stored Mollie Identifiers

- Customer ID (`cus_*`) -> `subscriptions.mollie_customer_id`
- Subscription ID (`sub_*`) -> `subscriptions.mollie_subscription_id`
- Payment ID (`tr_*`) -> `subscription_payment_attempts.mollie_payment_id`

## Lifecycle Operations

- Create customer: `POST /v2/customers`
- Create first payment: `POST /v2/payments` (`sequenceType=first`)
- Fetch payment truth in webhook: `GET /v2/payments/{id}`
- Create recurring subscription: `POST /v2/customers/{customerId}/subscriptions`
- Cancel subscription (stop future renewals): `DELETE /v2/customers/{customerId}/subscriptions/{subscriptionId}`
- Update subscription for end-of-period plan change: `PATCH /v2/customers/{customerId}/subscriptions/{subscriptionId}`

## Related Docs

- `docs/subscription-lifecycle.md` (canonical state machine)
- `docs/database-schema.md` (columns/functions)
- `docs/billing-and-tax-policy.md` (checkout/tax/invoice policy)
