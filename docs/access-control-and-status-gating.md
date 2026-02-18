# Access Control and Status Gating

## Purpose

This document defines Summit's canonical entitlement and write-gating model.  
It specifies how company status controls read/write behavior and where enforcement must happen.  
It is authoritative for status semantics and access mode definitions.

## Canonical Rules

- Canonical entitlement gate: `companies.status`.
- Allowed values: `trial`, `active`, `past_due`, `suspended`, `canceled`.
- Trial starts at signup (`handle_new_user()` sets `trial_ends_at = now() + interval '14 days'`).
- Full access: `trial` (when not expired), `active`.
- Read-only: `past_due`, `suspended`, `canceled`, and expired `trial`.
- `subscriptions.status` tracks payment lifecycle; it is not the canonical gate by itself.

## Status Definitions

- `trial`: company is in trial window; full access until trial expiry.
- `active`: valid paid subscription period; full access.
- `past_due`: payment problem/grace state; read-only.
- `suspended`: suspended entitlement; read-only.
- `canceled`: subscription canceled; read-only (entitlement no longer full).

## Gating Behavior

| Status Condition | Access Mode | Read | Write |
|---|---|---|---|
| `trial` and `trial_ends_at > now()` | full | allowed | allowed |
| `active` | full | allowed | allowed |
| `past_due` | read_only | allowed | blocked |
| `suspended` | read_only | allowed | blocked |
| `canceled` | read_only | allowed | blocked |
| `trial` and `trial_ends_at <= now()` | read_only | allowed | blocked |

## Subscription-to-Company Conceptual Mapping

- Webhook events update subscription lifecycle fields (`subscriptions.status`, periods, cancellation flags).
- Entitlement projection updates `companies.status` for app gating.
- Access decisions are made from `companies.status` (plus trial expiry timestamp condition).

## Enforcement Boundaries

Database / RLS:
- Enforces tenant isolation and owner-only operations by policy.
- Does not replace all product-level entitlement write gating.

Application server:
- Must enforce write gating before mutating operations.
- Must not rely only on UI disabled states.

UI:
- Reflects current access mode for UX clarity.
- Can hide or disable blocked actions but is not security-authoritative.

## Data Dependencies

See `docs/database-schema.md` for canonical schema details.

Primary dependencies:
- `companies`: `status`, `trial_ends_at`
- `subscriptions`: `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`
- `profiles`: `role`, `company_id`
- Functions used by authz/RLS: `current_user_company_id()`, `is_company_owner(...)`

## Open Questions / Planned Work

Planned:
- Finalize implementation detail for deterministic transition into read-only exactly at `trial_ends_at`.
- Finalize cancellation mode behavior in product UX (period-end vs immediate effect handling).

Open question:
- Whether `canceled` should remain read-only indefinitely or transition to archived/limited-recovery mode in a later phase.
