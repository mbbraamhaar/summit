# Summit - Database Schema

**Last Updated:** February 18, 2026  
**Database:** PostgreSQL (Supabase)  
**Security:** RLS enabled on all application tables

## Scope

This document is the canonical schema reference for:
- Tables and key columns
- Constraints and indexes
- Database functions
- Triggers
- RLS policies

It intentionally excludes product-scope narrative and non-schema implementation planning.

## Canonical Status and Role Values

### `companies.status`
Allowed values:
- `trial`
- `active`
- `past_due`
- `suspended`
- `canceled`

### `profiles.role`
Allowed values:
- `owner`
- `member`

### `invitations.status`
Allowed values:
- `pending`
- `accepted`
- `expired`
- `revoked`

### `subscriptions.status`
Allowed values:
- `active`
- `canceled`
- `past_due`
- `suspended`

## Tables

### `companies`
Tenant root entity.

Key columns:
- `id uuid primary key`
- `name text not null`
- `status text not null default 'trial'`
- `trial_ends_at timestamptz`
- `company_registration_id text`
- `tax_id text`
- `address_line1 text`
- `address_line2 text`
- `city text`
- `postal_code text`
- `country text`
- `bank_account_name text`
- `bank_account_number text`
- `bank_bic text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:
- `status` check constraint (`trial|active|past_due|suspended|canceled`)

RLS policies:
- `Users can view their company` (`SELECT`)
- `Owners can update company` (`UPDATE`, owner-only)

### `profiles`
App profile linked 1:1 with auth user.

Key columns:
- `id uuid primary key references auth.users(id) on delete cascade`
- `company_id uuid not null references companies(id) on delete cascade`
- `email text not null unique`
- `pending_email text`
- `pending_email_requested_at timestamptz`
- `pending_email_verification_sent_at timestamptz`
- `full_name text`
- `avatar_url text`
- `role text not null default 'member'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints and indexes:
- unique `email`
- partial unique index on `lower(pending_email)` when `pending_email is not null`
- role check constraint (`owner|member`)

RLS policies:
- `Users can view profiles in their company` (`SELECT`)
- `Users can update own profile` (`UPDATE`, self)
- `Owners can insert new members` (`INSERT`, owner-only)
- `Owners can delete members` (`DELETE`, owner-only and not self)

### `invitations`
Owner-managed invitation records.

Key columns:
- `id uuid primary key`
- `company_id uuid not null references companies(id) on delete cascade`
- `email text not null`
- `token_hash text not null unique`
- `status text not null default 'pending'`
- `invited_by uuid references profiles(id) on delete set null`
- `expires_at timestamptz not null`
- `accepted_at timestamptz`
- `revoked_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints and indexes:
- unique `token_hash`
- partial unique pending invite index by `(company_id, lower(email))`
- index on `company_id`
- index on `email`
- composite index on `(status, expires_at)`
- status check constraint (`pending|accepted|expired|revoked`)

RLS policies:
- `Owners can create invitations` (`INSERT`, owner-only)
- `Owners can update invitations` (`UPDATE`, owner-only)
- `Owners can view company invitations` (`SELECT`, owner-only)

### `plans`
Subscription plan catalog.

Key columns:
- `id uuid primary key`
- `name text not null`
- `description text`
- `price numeric(10,2) not null`
- `interval text not null`
- `features jsonb`
- `mollie_plan_id text`
- `is_active boolean default true`
- `created_at timestamptz not null`

Constraints:
- interval check constraint (`month|year`)

RLS policies:
- `Active plans are viewable by everyone` (`SELECT`, `is_active = true`)

### `subscriptions`
Company subscription lifecycle state.

Key columns:
- `id uuid primary key`
- `company_id uuid not null unique references companies(id) on delete cascade`
- `plan_id uuid not null references plans(id) on delete restrict`
- `status text not null`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `cancel_at_period_end boolean default false`
- `mollie_subscription_id text unique`
- `mollie_customer_id text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:
- unique `company_id` (one subscription per company)
- unique `mollie_subscription_id`
- status check constraint (`active|canceled|past_due|suspended`)

RLS policies:
- `Users can view their company subscription` (`SELECT`)
- `Owners can manage subscriptions` (`ALL`, owner-only)

## Database Functions

### `current_user_company_id()`
- Security-definer helper returning `profiles.company_id` for `auth.uid()`.
- Used by RLS policies to avoid recursive policy checks.

### `is_company_owner(target_company_id uuid)`
- Security-definer helper returning whether current user is `owner` in `target_company_id`.
- Used by owner-only policies.

### `handle_new_user()`
Auth signup trigger function.

Behavior:
- If metadata contains valid `invited_company_id`, creates profile as `member` in that company.
- Otherwise creates a new company and owner profile.
- Sets trial window during company creation (`trial_ends_at = now() + interval '14 days'`).

Trigger binding:
- `on_auth_user_created` (AFTER INSERT on `auth.users`)

### `accept_invitation(invite_token text, user_email text)`
Invitation acceptance function.

Semantics:
- Validates token hash + email match + invitation state.
- Handles idempotent acceptance.
- Returns status text:
  - `accepted`
  - `already_accepted`
  - `invalid`

### `update_updated_at_column()`
Generic timestamp-maintenance trigger function.

## Triggers

### Signup trigger
- `on_auth_user_created` on `auth.users`
- Executes `handle_new_user()`

### `updated_at` triggers
- `update_profiles_updated_at` on `profiles`
- `update_workspaces_updated_at` on `companies` (legacy trigger name, active on `companies`)
- `update_invitations_updated_at` on `invitations`
- `update_subscriptions_updated_at` on `subscriptions`

All execute `update_updated_at_column()` before row update.

## RLS Model Summary

- RLS enabled on all listed tables.
- Isolation boundary is `company_id`.
- Owner-only operations rely on `is_company_owner(...)`.
- Public read access is limited to active plan catalog entries.

## Relationship Summary

- `auth.users (1:1) profiles`
- `profiles (N:1) companies`
- `companies (1:1 optional) subscriptions`
- `subscriptions (N:1) plans`
- `companies (1:N) invitations`

## Notes

- Keep this document synchronized with migrations and generated types.
- Non-schema product behavior belongs in domain docs and feature spec, not here.
