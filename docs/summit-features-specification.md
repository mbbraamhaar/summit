# Summit - Features Specification

**Last Updated:** February 18, 2026  
**Document Role:** Product scope overview (not lifecycle authority)

## Purpose

This document defines Summit feature scope by version and domain area.  
It is authoritative for what is in v1 vs planned for v2.  
Detailed lifecycle/state-machine behavior lives in domain docs.

## Product Scope Summary

### Version 1 (Current Target)
- Fixed-bid projects only
- Milestone-based invoicing
- Company collaboration (`owner` and `member`)
- Subscription billing foundation (Mollie integration path)

### Not in Version 1 (Deferred)
- Session packs (hourly/block time)
- Retainer agreements
- Advanced automation and analytics
- Internal admin tooling

## Domain Feature Areas

### 1) Identity and Auth
In v1:
- Signup/sign-in/sign-out
- Email verification
- Password reset/update
- Company membership via invitations
- Profile editing basics (including pending email change flow)

Planned for v2+:
- Expanded identity observability and advanced abuse protections

Details:
- `docs/identity-and-auth.md`

### 2) Access Control and Entitlements
In v1:
- Roles: `owner`, `member`
- Tenant isolation via RLS
- Status-based full vs read-only gating via `companies.status`

Planned for v2+:
- Additional entitlement tooling and operational controls

Details:
- `docs/access-control-and-status-gating.md`

### 3) Billing and Tax
In v1:
- B2B-only subscription billing policy
- Required billing identity collection
- Checkout gating based on tax/business validation rules

Planned for v2+:
- Extended tax-operation tooling and audit surfaces

Details:
- `docs/billing-and-tax-policy.md`

### 4) Mollie Subscriptions
In v1:
- Plan selection and subscription lifecycle integration
- Webhook-driven subscription truth model
- Idempotent webhook processing requirement

Planned for v2+:
- Extended plan-change and lifecycle variants

Details:
- `docs/mollie-subscriptions.md`

### 5) Core Domain (Clients, Projects, Milestones)
In v1:
- Client management
- Fixed-bid project management
- Milestone tracking and completion workflow

Planned for v2+:
- Expanded project automation patterns

### 6) Invoice Engine and Documents
In v1:
- Invoice generation path for project/customer billing
- Subscription invoice architecture direction
- PDF output target

Planned for v2+:
- UBL output
- Broader invoice orchestration and compliance automation

Details:
- `docs/invoice-engine-architecture.md`

### 7) Notifications and Messaging
In v1:
- Essential transactional email flows (verification, reset, invites)
- Core invoice email delivery path

Planned for v2+:
- Reminder workflows and richer notification channels

### 8) Observability and Reliability
In v1:
- Minimal operational baseline

Planned for v2+:
- Advanced metrics, retries, and operational dashboards

## v1 vs v2 Scope Matrix

| Area | v1 | v2+ |
|---|---|---|
| Fixed-bid projects | Included | Extended |
| Milestone-based invoicing | Included | Extended |
| Session packs | Deferred | Planned |
| Retainer agreements | Deferred | Planned |
| Owner/member collaboration | Included | Extended |
| Status-based read-only gating | Included | Extended |
| Mollie subscription lifecycle | Included (foundation) | Extended |
| Advanced reporting/metrics | Deferred | Planned |
| Internal admin tools | Deferred | Planned |

## Canonical References

- Architecture boundaries: `docs/development-context.md`
- Database schema reference: `docs/database-schema.md`
- Identity and auth lifecycle: `docs/identity-and-auth.md`
- Access control and gating: `docs/access-control-and-status-gating.md`
- Billing and tax policy: `docs/billing-and-tax-policy.md`
- Mollie subscription lifecycle: `docs/mollie-subscriptions.md`
- Invoice engine architecture: `docs/invoice-engine-architecture.md`
- Sprint status/checklists: `docs/sprint-0-overview.md`
