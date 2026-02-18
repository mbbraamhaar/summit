# Identity and Auth

## Purpose

This document defines Summit's identity and authentication lifecycle rules.  
It covers signup and verification, invitations, password reset, and email change behavior.  
It is authoritative for identity flow semantics and security invariants.

## Canonical Rules

- Identity uses Supabase Auth; application profile data is in `profiles`.
- One user belongs to one company.
- Signup without invitation creates a new company and `owner` profile.
- Signup with valid invitation context creates/attaches as `member` in target company.
- Invitation acceptance is email-bound: authenticated session email must match invitation email.
- Invitation token handling is idempotent and safe to retry.
- Invitation tokens are stored as hashed values (`token_hash`), not plain tokens.

## Flows and State Machines

### Signup and Email Verification (High Level)
1. User signs up with email/password.
2. Auth user is created.
3. Database trigger `handle_new_user()`:
   - Invited flow: validates `invited_company_id`, creates member profile.
   - Non-invited flow: creates company (`status = trial`, `trial_ends_at = now() + 14 days`) and owner profile.
4. User verifies email through auth callback flow.
5. After verification/sign-in, user lands in app entry flow.

Current state:
- Implemented in foundation flow.
- Trial starts at signup time, not verification time.

### Invitation Lifecycle
Canonical statuses:
- `pending`: invitation exists and can be accepted before `expires_at`.
- `accepted`: invitation consumed.
- `revoked`: owner canceled invitation.
- `expired`: schema status exists; current runtime also derives expiration by checking `pending` + `expires_at <= now()`.

Acceptance outcomes:
- `accepted`
- `already_accepted`
- `invalid` (missing, revoked, expired, or email mismatch)

### Password Reset and Invite Interaction
1. User requests password reset.
2. User completes reset/update-password flow.
3. Post-auth routing checks invite context.
4. If invite context exists, flow continues to invite acceptance path.

Canonical behavior:
- Invite context survives reset and normal auth transitions.
- Invalid/expired invite context is cleared deterministically.

### Email Change Lifecycle (High Level)
1. User requests email change.
2. System stores `pending_email` plus request/verification timestamps.
3. User verifies new email through callback flow.
4. System finalizes `profiles.email` only when verified auth email matches `pending_email`.
5. Canceling pending change clears pending fields.

Canonical behavior:
- Until verification, canonical email remains `profiles.email`.
- Stale or canceled verification links must not silently overwrite profile email.

## Data Dependencies

See `docs/database-schema.md` for canonical schema details.

Primary dependencies:
- `profiles`: `id`, `company_id`, `email`, `pending_email`, `pending_email_requested_at`, `pending_email_verification_sent_at`, `role`
- `companies`: `id`, `status`, `trial_ends_at`
- `invitations`: `company_id`, `email`, `token_hash`, `status`, `expires_at`, `accepted_at`, `revoked_at`
- Function: `handle_new_user()`
- Function: `accept_invitation(invite_token, user_email)`
- RLS ownership checks via `is_company_owner(...)`

## Security Invariants

- Invitation acceptance requires session-email and invitation-email match.
- Invitation tokens are single-use in effect (`accepted` is terminal, retries return `already_accepted`).
- Token storage is hashed, reducing leak impact.
- Expired/revoked/invalid invites are rejected deterministically.
- Pending email never becomes canonical without verified auth-state alignment.

## Open Questions / Planned Work

Planned:
- Explicitly persist `expired` status transitions for pending invites (today expiration is also derived by timestamp checks).
- Add/complete rate limiting for signup, sign-in, password reset, and invite acceptance entry points.
- Expand audit logging for sensitive identity state transitions.

Open question:
- Whether to add explicit invite resend and expiration-event logging schema for operational observability.
