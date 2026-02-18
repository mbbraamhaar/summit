# Summit - Development Context

**Last Updated:** February 18, 2026  
**Role of this document:** Architectural spine and authority index

## Documentation Map

Use this map to avoid duplication and drift.

- `docs/development-context.md`  
  Cross-cutting architecture decisions and the authority map. This file is authoritative for boundaries and decision ownership.
- `docs/database-schema.md`  
  Canonical database reference (tables, constraints, functions, triggers, RLS).
- `docs/summit-features-specification.md`  
  Product scope overview (v1 vs v2 and feature areas).
- `docs/identity-and-auth.md`  
  Identity and authentication lifecycle rules (signup, invites, password reset, email change).
- `docs/access-control-and-status-gating.md`  
  Canonical entitlement and read-only/full-access gating model.
- `docs/billing-and-tax-policy.md`  
  Billing and tax policy decisions for checkout and invoicing behavior.
- `docs/mollie-subscriptions.md`  
  Mollie subscription lifecycle and webhook authority principles.
- `docs/invoice-engine-architecture.md`  
  Shared invoice engine architecture for Summit subscription invoices and future customer invoices.
- `docs/sprint-0-overview.md`  
  Sprint 0 execution checklist and current delivery status (not canonical for architecture rules).

**Rule:** Cross-cutting decisions live in `development-context.md`. Domain-specific details live in the domain docs.

## Authority Boundaries

### 1) `docs/development-context.md`
Authoritative for:
- Architectural decisions and boundaries
- Tenancy model (one user = one company)
- Role model (`owner` and `member`)
- Canonical access gate: `companies.status`
- High-level principle: truth comes from webhooks, not return URLs

Not for:
- Detailed flow/state-machine behavior (lives in domain docs)
- Full schema definitions (live in `docs/database-schema.md`)

### 2) `docs/database-schema.md`
Authoritative for:
- Database schema reference
- Database functions, triggers, and RLS policies

Not for:
- Product copy or feature-level workflow narrative

### 3) `docs/summit-features-specification.md`
Authoritative for:
- Product scope: v1 vs v2
- Feature inventory by domain area

Not for:
- Deep lifecycle/state-machine details
- Canonical schema behavior

### 4) `docs/sprint-0-overview.md`
Authoritative for:
- Sprint checklist and progress status

Not for:
- Canonical architecture rules (it may link to canonical docs)

## Canonical Cross-Cutting Decisions

### Tenancy Model (Canonical)
- Summit uses a single-company tenancy model.
- One user belongs to exactly one company.
- Email is globally unique at identity level.
- Company isolation is enforced with RLS at the database layer.

### Role Model (Canonical)
- Roles are `owner` and `member`.
- `owner`: company settings, billing, member/invitation management, plus full data operations.
- `member`: full data operations, but no billing or member/invitation management.

### Access Gating (Canonical)
- The canonical entitlement gate is `companies.status`.
- Allowed values: `trial`, `active`, `past_due`, `suspended`, `canceled`.
- `trial` and `active` map to full access.
- `past_due`, `suspended`, and `canceled` map to read-only behavior.
- Trial starts at signup (via `handle_new_user()` setting `trial_ends_at = now() + interval '14 days'`).

See full rules in `docs/access-control-and-status-gating.md`.

### Payment Authority Principle (Canonical)
- Subscription/payment truth is derived from webhook events.
- Return URLs are UX navigation only and are not authoritative for entitlement decisions.

See full lifecycle and idempotency requirements in `docs/mollie-subscriptions.md`.

### Terminology (Canonical)
- Canonical tenant term is **company**.
- Legacy **workspace** strings may remain in historical code/UI labels, but map 1:1 to company.

## Authority Map

| Topic | Authoritative Doc |
|---|---|
| Architecture boundaries and decision ownership | `docs/development-context.md` |
| Tenancy model and role model | `docs/development-context.md` |
| Access gate (`companies.status`) and read-only behavior | `docs/access-control-and-status-gating.md` |
| Identity/auth lifecycle (signup, invites, password reset, email change) | `docs/identity-and-auth.md` |
| Billing/tax policy and checkout gating | `docs/billing-and-tax-policy.md` |
| Mollie subscription lifecycle and webhook authority | `docs/mollie-subscriptions.md` |
| Invoice engine architecture and adapter model | `docs/invoice-engine-architecture.md` |
| Database schema, functions, triggers, RLS | `docs/database-schema.md` |
| Product scope (v1 vs v2) | `docs/summit-features-specification.md` |
| Sprint execution status and checklist | `docs/sprint-0-overview.md` |

## Related Documents

- `docs/database-schema.md`
- `docs/summit-features-specification.md`
- `docs/identity-and-auth.md`
- `docs/access-control-and-status-gating.md`
- `docs/billing-and-tax-policy.md`
- `docs/mollie-subscriptions.md`
- `docs/invoice-engine-architecture.md`
- `docs/sprint-0-overview.md`
