# Mollie Subscriptions

## Purpose

This document defines Summit's subscription lifecycle expectations with Mollie.  
It is authoritative for flow intent, webhook authority, and idempotent processing principles.  
It intentionally avoids low-level API implementation details.

## Canonical Rules

- Subscription behavior target is set-and-forget for normal renewals.
- Canonical flow: select plan -> create/reuse customer -> create first payment (charged immediately) -> process webhook -> create recurring subscription starting next period -> project entitlement to `companies.status`.
- Webhooks are authoritative for payment/subscription state transitions.
- Return URLs are non-authoritative and used for UX navigation only.
- Webhook processing must be idempotent to prevent double-processing.
- One subscription per company is enforced by schema (`subscriptions.company_id` unique).

## Lifecycle Flow (Conceptual)

1. User selects plan (monthly or yearly).
2. System creates or reuses Mollie customer for company.
3. System creates Mollie first payment checkout (`sequenceType=first`) and charges immediately.
4. User may return via return URL (UX-only).
5. Webhook confirms payment result (authoritative).
6. On first payment `paid`, system creates Mollie recurring subscription with `startDate = current_period_end` (next period start).
7. System updates `subscriptions` lifecycle fields and projects entitlement to `companies.status`.

## Set-and-Forget Expectations

- Successful renewals should continue without user action.
- Failed renewals should move company into non-full-access status via entitlement projection.
- Recovering payment should restore full access through webhook-driven status updates.

## Authority and Idempotency Principles

Webhook authority:
- Payment/subscription truth is accepted from webhook events.
- Return URL cannot independently mark subscription paid/active.

Idempotency:
- Replayed or duplicate events must not create duplicate state transitions.
- Processing should deduplicate by provider event identity and company/subscription keys.
- Resulting entitlement updates should be repeat-safe.

## Cancellation Behavior

Current direction:
- Cancel at period end is the expected default behavior.

Planned clarification:
- Immediate cancellation behavior is still planned as a policy/UX decision and must be explicitly documented before rollout.

## Data Dependencies

See `docs/database-schema.md` for canonical schema details.

Primary dependencies:
- `subscriptions`: `mollie_customer_id`, `mollie_subscription_id`, `status`, period fields, `cancel_at_period_end`
- `subscription_payment_attempts`: payment status timeline and idempotency key (`mollie_payment_id`)
- `companies`: `status` (entitlement gate)
- `plans`: selected plan and billing interval

## Open Questions / Planned Work

Planned:
- Define and document webhook event storage and replay-handling strategy in production.
- Finalize subscription cancellation UX for period-end and possible immediate paths.
- Add operational monitoring for webhook failures, retries, and dedupe outcomes.

Open question:
- Whether to support plan switches mid-cycle in v1 or defer to v2 policy.
