# Subscription Lifecycle

**Last Updated:** February 20, 2026  
**Canonical scope:** Summit subscription state machine and invariants

## A. Scope and Authority

This document is the canonical source for subscription lifecycle behavior.

Authority boundaries:
- `POST /api/mollie/webhook` is authoritative for payment outcomes.
- The webhook always fetches payment truth from Mollie (`GET /v2/payments/{id}`) before mutating state.
- Return URLs (for example `/settings/billing/return`) are navigation-only and never grant/revoke entitlement.

Database authority:
- Post-webhook lifecycle state is persisted in `subscriptions`, `subscription_payment_attempts`, and projected to `companies.status`.
- Database RPCs are the mutation boundary for lifecycle transitions:
  - `activate_subscription_after_first_payment`
  - `apply_recurring_payment`
  - `evaluate_subscription_period_expiry`

## B. Data Model Summary

Subscription row model:
- Summit uses one durable `subscriptions` row per company.
- Re-subscribe reuses the same row (it is reset to `pending` during new checkout start, not recreated).

`subscriptions` fields:
- `status`: lifecycle state (`pending`, `active`, `past_due`, `suspended`, `canceled`).
- `current_period_start`, `current_period_end`: UTC period boundaries.
  - `current_period_end` is treated as the paid-through boundary.
  - Period extension always advances from the existing `current_period_end`.
- `mollie_customer_id`: Mollie customer identity linked to the company subscription.
- `mollie_subscription_id`: Mollie recurring subscription identity (nullable until first payment activation links it).
- `cancel_at_period_end`: cancellation intent flag.
  - `true` means future renewals are stopped in Mollie, while Summit access remains until period expiry handling transitions state.
- `pending_plan_id`: plan scheduled for next successful recurring renewal.
- `past_due_since`: timestamp when renewal failure first moved status to `past_due`.
- `suspended_at`: timestamp when grace elapsed and status moved to `suspended`.

`subscription_payment_attempts` fields:
- `mollie_payment_id` is unique and is the provider payment identity anchor.
- `processed_at` is the idempotency anchor for recurring mutation processing.
  - null = not yet applied to state machine
  - non-null = already applied (replays are no-op)

## C. Invariants

- One subscription row per company (`subscriptions.company_id` unique).
- Payment truth comes from webhook + Mollie fetch; return URLs are non-authoritative.
- Period extension is based on `current_period_end`, never on `now()`.
- Recurring idempotency is enforced by `subscription_payment_attempts.processed_at`.
- `cancel_at_period_end` is never cleared by recurring renewal logic.
- `pending_plan_id` is only applied on successful recurring `paid` handling, then cleared.
- Recurring correlation rules:
  - `payment.customerId` is required.
  - Subscription is resolved by `subscriptions.mollie_customer_id`.
  - Exactly one row must match; zero or multiple matches are safe-skip conditions.
  - If Mollie payment contains `subscriptionId`, cross-check against `subscriptions.mollie_subscription_id` when present.
  - No company-id fallback is used for recurring mutations.
- Webhook replay safety: duplicate/replayed payment IDs must not double-extend periods or double-flip state.

## D. State Machine

| Current state | Event | Preconditions | DB mutation (high level) | Company entitlement effect | Idempotency notes |
|---|---|---|---|---|---|
| `pending` | First payment `paid` (`sequenceType=first`) | Strict correlation passes (subscription/company metadata, customer checks, amount checks) | Link/create Mollie subscription, then `activate_subscription_after_first_payment` sets `status=active`, period fields, Mollie IDs | `companies.status -> active` | RPC returns `already_active`/`already_linked` for replay-safe handling |
| `pending` | First payment terminal failure (`failed`/`expired`/`canceled`) | First-payment sequence | Keep/update `subscriptions.status = pending` | No change | Repeat-safe (same end state) |
| `active` | Recurring `paid` | Correlation via customer ID succeeds; attempt exists; `processed_at is null` | `apply_recurring_payment`: `current_period_start = previous current_period_end`, `current_period_end = precomputed next end`, keep `status=active` | `companies.status -> active` | `processed_at` set in same transaction; replays return `already_processed` |
| `active` | Recurring terminal failure | Correlation succeeds; attempt exists; `processed_at is null` | `apply_recurring_payment`: `status -> past_due`, `past_due_since = now` | Company remains `active` during grace | `processed_at` prevents duplicate transitions |
| `past_due` | Recurring terminal failure after grace | `past_due_since + 7 days <= now` | `apply_recurring_payment`: `status -> suspended`, `suspended_at = now` | `companies.status -> suspended` (gated) | Replay-safe via `processed_at` |
| `past_due` or `suspended` | Recurring `paid` | Correlation succeeds; attempt exists; `processed_at is null` | `apply_recurring_payment`: extend period, `status -> active`, clear `past_due_since` and `suspended_at` | `companies.status -> active` | Returns `recovered` / `recovered_plan_changed` |
| non-`canceled` | Cancel requested (owner endpoint) | Not `pending`; Mollie IDs present; Mollie cancel succeeds | Set `cancel_at_period_end = true`; do not change period fields/status immediately | No immediate change | Endpoint is idempotent when already canceled or already flagged |
| `active` with `cancel_at_period_end=true` | Period expiry evaluation | `current_period_end <= now` | `evaluate_subscription_period_expiry`: `status -> canceled` | `companies.status -> canceled` (gated) | Repeated evaluation returns `no_change` after first transition |
| `active` | Plan change scheduled | New plan active; not already same pending plan; not canceling | PATCH Mollie subscription for next cycle; set `pending_plan_id` | No immediate change | Scheduling same pending plan is idempotent |
| `active` with `pending_plan_id` | Successful recurring `paid` renewal | Handled inside recurring RPC paid path | `apply_recurring_payment`: flip `plan_id = pending_plan_id`, then clear `pending_plan_id` | No separate entitlement change (remains active) | Same payment replay cannot double-flip due to `processed_at` |

## E. Grace Policy

Grace definition:
- Grace window is 7 days from `past_due_since`.
- During grace, subscription status is `past_due` and company remains `active`.

Enforcement:
- Enforced in `apply_recurring_payment` on recurring terminal failure handling.
- If still within grace, status remains `past_due`.
- If grace elapsed (`past_due_since + 7 days <= now`), transition to `suspended`.
- No cron is required for this behavior; state advances on webhook processing.

## F. Cancellation Policy (Cancel At Period End Only)

Rules:
- Summit uses cancel-at-period-end semantics (no immediate entitlement revocation).
- Cancel endpoint cancels Mollie subscription immediately to stop future renewals.
- Summit sets `cancel_at_period_end = true` and preserves current access through period end.
- Period expiry is applied lazily via `evaluate_subscription_period_expiry`.

Idempotency and edge behavior:
- Already `canceled` or already `cancel_at_period_end=true` returns idempotent success.
- `pending` subscriptions cannot be canceled.
- If Mollie cancel fails, DB is not mutated.
- Cancellation intent flag is not cleared by recurring renewal logic.

## G. Plan Change Policy (End Of Paid Period Only)

Scheduling:
- Owner schedules with `POST /api/billing/subscription/change-plan`.
- Preconditions: active subscription, active target plan, Mollie IDs present, `cancel_at_period_end=false`.
- System PATCHes Mollie subscription with new amount/interval and `startDate` derived from `current_period_end` (`YYYY-MM-DD`, UTC date-only), then sets `pending_plan_id`.

Application:
- On next successful recurring `paid`, `apply_recurring_payment` applies plan flip transactionally:
  - `plan_id = pending_plan_id`
  - `pending_plan_id = null`
- No proration is implemented.
- `cancel_at_period_end` is preserved.

## H. Operational Runbook

Logs to query:
- Webhook core: `mollie_webhook_received`, `mollie_webhook_payment_status_fetched`, `mollie_webhook_activation_executed`, `mollie_webhook_activation_skipped`.
- Recurring: `mollie_recurring_payment_received`, `mollie_recurring_extended`, `mollie_recurring_recovered`, `mollie_recurring_past_due`, `mollie_recurring_suspended`, `mollie_recurring_already_processed`, `mollie_recurring_skipped`.
- Cancellation/expiry: `mollie_subscription_cancel_requested`, `mollie_subscription_cancel_idempotent`, `mollie_subscription_period_expired_canceled`.
- Plan change: `mollie_plan_change_scheduled`, `mollie_plan_change_applied`, `mollie_plan_change_idempotent`.

Replay guidance:
- Webhook replay is safe when `mollie_payment_id` is unchanged.
- For recurring payments, `processed_at` guarantees no double mutation.

Skip-condition interpretation:
- `multiple_subscriptions_for_customer`: data corruption risk; investigate duplicate customer linkage before manual replay.
- `subscription_not_found` / `customer_mismatch` / `subscription_id_mismatch`: correlation mismatch; resolve linkage before reprocessing.

Related docs:
- `docs/mollie-subscriptions.md` for provider integration details.
- `docs/database-schema.md` for schema/functions reference.
- `docs/billing-and-tax-policy.md` for checkout/tax policy boundaries.
