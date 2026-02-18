# Summit - Development Context

**Last Updated:** February 18, 2026  
**Current Sprint:** Sprint 0 (Technical Foundation)  
**Status:** Active

---

## Project Overview

**Summit** is a SaaS application for freelancers and small studios to automate milestone-based invoicing for fixed-bid projects.

### Core Value Proposition
- Track clients and fixed-price projects
- Define project milestones with payment schedules
- Automatically generate invoices when milestones are completed
- Process payments via Mollie integration

### Version 1 Scope
**Focus:** Fixed-bid projects with milestone-based invoicing only
- ❌ NO session packs (hourly/block time) in v1
- ❌ NO retainer agreements in v1
- ✅ ONLY fixed-price projects with milestones

### Terminology (Canonical)
- **Company** is the canonical tenant term in schema and backend logic (`companies`, `profiles.company_id`, `subscriptions.company_id`, `invitations.company_id`).
- **Workspace** may still appear in legacy UI copy and error codes (for example `WORKSPACE_READ_ONLY`), but maps 1:1 to company.
- Documentation should use **company** unless referencing an existing code symbol or UI string verbatim.

---

## Tech Stack

### Framework & Languages
- **Next.js 16.1.6** (App Router)
- **TypeScript** (strict mode)
- **React 19** (Server Components by default)

### Styling
- **Tailwind CSS**
- **shadcn/ui** (components installed on-demand, not upfront)
- Custom Summit domain components for specialized UI (timelines, schedules)

### Database & Auth
- **Supabase** (PostgreSQL with RLS)
- **Supabase Auth** (cookie-based sessions via @supabase/ssr)

### Payments
- **Mollie** (test mode during development)

### Deployment
- **Vercel** (not deployed yet)

---

## Key Architectural Decisions

### 1. Multi-Tenancy Model: Single Company Per User

**CRITICAL:** This is NOT a traditional multi-organization membership model.

**The Model:**
- One user = one company (forever)
- Email address is globally unique (can't join another company)
- When user signs up → auto-creates company → becomes owner
- Owners can invite members to THEIR company
- Members have full data access (create clients, projects, invoices)
- Owners control billing, invites, and company settings

**Why this matters:**
- Simpler schema (no complex company_members join table)
- Clearer ownership model
- Still multi-tenant (complete company isolation via RLS)
- Each company has own subscription

### 2. Role Model: Owner vs Member

**Two roles only:**
- **Owner** - Full permissions (billing, member management, invites, all data operations)
- **Member** - Full data permissions (can create/edit/delete clients, projects, invoices) but NO billing or member management

**Important:** Members are NOT limited in data access. They can:
- ✅ Create, edit, delete clients
- ✅ Create, edit, delete projects
- ✅ Generate and send invoices
- ✅ Mark milestones complete
- ✅ View billing info (read-only)
- ❌ Cannot manage subscription
- ❌ Cannot invite/remove members
- ❌ Cannot delete company

### 3. Trial & Subscription Model

**Trial Period:** 14 days (starts after email verification)
- User signs up → email verification → trial starts
- Company status: `trial`
- Full access during trial

**Subscription:**
- Tied to company, not individual users
- One plan: "Summit Pro" (monthly or yearly)
- Monthly: €15/month (note: we seeded with 15.00, not 29.00)
- Yearly: €150/year
- When trial ends or payment fails: write access is blocked but data remains readable

**Access Control:**
- `companies.status` = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
- `trial` or `active` → full access
- `past_due`, `suspended`, `canceled` → read-only access (can log in, view data, cannot create/edit)

### Access Control Matrix (Authoritative)

This is the single source of truth for app access gating behavior.

| Source | Field | Purpose | Notes |
|---|---|---|---|
| `companies` | `status` | Product access gating | Primary gate for read vs write behavior |
| `companies` | `trial_ends_at` | Trial expiry cutoff | `trial` becomes read-only when expired |
| `subscriptions` | `status` | Payment lifecycle tracking | Used by billing logic/webhooks, not tenant isolation |

| `companies.status` | Default mode | Write access | Read access |
|---|---|---|---|
| `trial` (not expired) | full | allowed | allowed |
| `active` | full | allowed | allowed |
| `past_due` | read_only | blocked | allowed |
| `suspended` | read_only | blocked | allowed |
| `canceled` | read_only | blocked | allowed |
| `trial` (expired) | read_only | blocked | allowed |

Implementation notes:
- Write gating is enforced server-side via subscription helpers (not only UI state).
- Invitation create/revoke currently allows owner actions when status is `trial`, `active`, `past_due`, or `suspended` and trial is not expired.
- Product rule says trial starts after email verification, but the current `handle_new_user()` trigger sets `trial_ends_at` at signup time. This can shorten effective trial time if verification is delayed.

### 4. Next.js 16 Patterns (IMPORTANT!)

We're on **Next.js 16.1.6** which has breaking changes:

**Async cookies API:**
```typescript
// OLD (Next.js 14/15):
const cookieStore = cookies()

// NEW (Next.js 16):
const cookieStore = await cookies()
```

**Our Supabase clients already handle this:**
- `lib/supabase/server.ts` - async function, awaits cookies()
- `lib/supabase/client.ts` - browser client (no changes needed)
- `middleware.ts` - has deprecation warning but still works

**When creating new files:** Always use the async pattern for server-side cookie access.

---

## Database Schema

### Tables

#### `companies`
```sql
- id (uuid, pk)
- name (text)
- status (text) - 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
- trial_ends_at (timestamp)
- company_registration_id (text, nullable)
- tax_id (text, nullable)
- address fields (address_line1, address_line2, city, postal_code, country)
- bank fields (bank_account_name, bank_account_number, bank_bic)
- created_at (timestamp)
- updated_at (timestamp)
```

#### `profiles`
```sql
- id (uuid, pk, references auth.users)
- company_id (uuid, references companies)
- email (text, unique)
- pending_email (text, nullable, unique when present)
- pending_email_requested_at (timestamp, nullable)
- pending_email_verification_sent_at (timestamp, nullable)
- full_name (text, nullable)
- avatar_url (text, nullable)
- role (text) - 'owner' | 'member'
- created_at (timestamp)
- updated_at (timestamp)
```

**Key relationships:**
- One profile belongs to one company (many profiles can belong to the same company)
- Email is globally unique (enforced)
- Role determines UI access only (both can manage data)

#### `plans`
```sql
- id (uuid, pk)
- name (text) - "Summit Pro"
- description (text)
- price (numeric)
- interval (text) - 'month' | 'year'
- features (jsonb)
- mollie_plan_id (text, nullable)
- is_active (boolean)
- created_at (timestamp)
```

**Seeded plans:**
- Summit Pro Monthly: €15.00
- Summit Pro Yearly: €150.00

#### `subscriptions`
```sql
- id (uuid, pk)
- company_id (uuid, references companies, unique)
- plan_id (uuid, references plans)
- status (text) - 'active' | 'canceled' | 'past_due' | 'suspended'
- current_period_start (timestamp)
- current_period_end (timestamp)
- cancel_at_period_end (boolean)
- mollie_subscription_id (text, unique)
- mollie_customer_id (text)
- created_at (timestamp)
- updated_at (timestamp)
```

**Important:** One subscription per company (enforced by unique constraint on company_id)

#### `invitations`
```sql
- id (uuid, pk)
- company_id (uuid, references companies)
- email (text)
- token_hash (text, unique)
- status (text) - 'pending' | 'accepted' | 'expired' | 'revoked'
- invited_by (uuid, references profiles, nullable)
- expires_at (timestamp)
- accepted_at (timestamp, nullable)
- revoked_at (timestamp, nullable)
- created_at (timestamp)
- updated_at (timestamp)
```

### Database Triggers

#### Auto-create company and profile on signup
```sql
-- Function: handle_new_user()
-- Trigger: on_auth_user_created (after insert on auth.users)
-- Does:
--   1. If invited signup metadata includes invited_company_id:
--      - validates target company exists
--      - creates profile as member in existing company
--   2. Otherwise:
--      - creates a new company with 14-day trial
--      - creates profile as owner of that company
--   3. Company name fallback: company_name -> full_name -> email local-part
```

#### Auto-update timestamps
```sql
-- Function: update_updated_at_column()
-- Triggers on: profiles, companies, subscriptions, invitations
```

### RLS Policies (Row Level Security)

**ALL tables have RLS enabled.** Key policies:

#### Profiles
- Users can view profiles in their company
- Users can update their own profile
- Owners can insert new members (invitations)
- Owners can delete members (but not themselves)

#### Companies
- Users can view their own company
- Owners can update their company

#### Plans
- Anyone can view active plans (for pricing page)

#### Subscriptions
- Users can view their company's subscription
- Owners can manage subscriptions

#### Invitations
- Owners can create and update invitations for their company
- Owners can view company invitations

---

## Project Structure

```
summit/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (sign-in, sign-up, etc.)
│   ├── (app)/             # Protected app routes (dashboard, settings, etc.)
│   ├── api/               # API routes
│   │   └── webhooks/      # External webhook endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/
│   ├── ui/                # shadcn/ui components (install on-demand)
│   ├── auth/              # Auth-specific components
│   ├── billing/           # Billing/subscription components
│   ├── summit/            # Custom Summit domain components
│   └── layout/            # Layout components (nav, sidebar)
├── lib/
│   ├── supabase/
│   │   ├── server.ts      # Server-side client (async)
│   │   └── client.ts      # Browser client
│   ├── auth/              # Auth helpers
│   ├── subscriptions/     # Subscription helpers
│   ├── mollie/            # Mollie client
│   └── utils.ts           # Shared utility helpers
├── types/
│   └── database.ts        # Generated Supabase types
├── hooks/                 # Custom React hooks
├── middleware.ts          # Session refresh middleware
├── .cursorrules           # Coding conventions
├── .env.local             # Local env vars (not in git)
└── .env.example           # Environment template (in git)
```

---

## Environment Variables

### Required Variables (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[publishable-key]
SUPABASE_SERVICE_ROLE_KEY=[secret-key]

# Mollie (placeholders for now)
MOLLIE_API_KEY=test_your-test-key
MOLLIE_WEBHOOK_SECRET=your-webhook-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Invitations / Email (Resend)
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=Summit <no-reply@your-domain.com>
INVITE_EXPIRY_HOURS=168

# Optional (currently not used in runtime logic)
NEXT_PUBLIC_ENABLE_AVATAR_UPLOAD=false
```

**Security notes:**
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the browser.
- Only `NEXT_PUBLIC_*` values are client-safe.
- Invitation and profile-admin flows that use privileged APIs must run server-side only.
- `MOLLIE_API_KEY` and `MOLLIE_WEBHOOK_SECRET` are required for billing rollout, but webhook handlers are not yet implemented.
- `NEXT_PUBLIC_ENABLE_AVATAR_UPLOAD` exists in `.env.example` as optional compatibility scaffolding and is not used by current runtime code.

### Service Role Boundaries
- Allowed usage: server routes/actions and server-only utilities (for example invite lookup and admin auth operations).
- Disallowed usage: client components, browser bundles, or public API responses.
- RLS remains mandatory for normal application reads/writes; service role bypass should be scoped to exceptional flows only.

## Coding Conventions (from `.cursorrules`)

### General Patterns
- **Server Components by default** - Only add `'use client'` when necessary
- **Named exports preferred** - EXCEPT where Next.js requires default (page/layout/error/loading)
- **No src/ directory** - Flat structure with /app, /components, /lib at root

### Supabase Usage
```typescript
// Server-side (in Server Components, API Routes, Server Actions)
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient() // Note: async in Next.js 16
const { data } = await supabase.from('profiles').select('*')

// Client-side (in 'use client' components)
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data } = await supabase.from('profiles').select('*')
```

**Never expose service_role key client-side!**

### Authorization Patterns
- **Enforce via RLS policies**, not app-level checks
- RLS is source of truth for data access
- App-level checks are for UI only (showing/hiding buttons)

### Validation
- Use **Zod** for all input validation (server-side)
- Return 401 for unauthenticated
- Return 403 for authenticated but not authorized

### Styling
- **Tailwind only** (no CSS modules, no inline styles)
- Use `cn()` helper for conditional classes
- Install shadcn/ui components on-demand (don't install all upfront)

### File Creation Triggers
When building, create actual files for:
- Any component over 20 lines
- All pages and layouts
- All API routes
- All helper/utility functions
- Configuration files

---

## Supabase Configuration

### Authentication Settings (Already Configured)
- **Email auth enabled** with email confirmation required
- **Site URL:** http://localhost:3000
- **Redirect URLs:** http://localhost:3000/**
- **Email templates:** Using defaults (can customize later)

### Database
- **RLS enabled on all tables**
- **No automatic RLS** (we create policies manually)
- **Connection pooling:** Default settings

---

## Database Functions

### `accept_invitation(invite_token, user_email)`
- Validates the invitation token hash and expiry
- Verifies session email against invitation email
- Attaches or updates the user profile to the target company
- Marks invitation status as accepted
- Returns status text (`accepted`, `already_accepted`, or `invalid`)

---

## Billing Safety Baseline

- Webhook processing must be idempotent (deduplicate by provider event ID and company/subscription keys).
- The schema enforces one subscription per company (`subscriptions.company_id` is unique).
- Access gating must be enforced server-side using company entitlement checks, not only in UI.
- `companies.status` is the access gate; `subscriptions.status` is payment lifecycle state.
- Service-role operations must stay in server-only contexts and be limited to privileged workflows.

---

## Auth & Lifecycle Flows

### Email Change Lifecycle

1. User requests email change from `/profile`.
2. System stores `pending_email`, `pending_email_requested_at`, and `pending_email_verification_sent_at`.
3. User must verify via `/auth/email-change/callback` before profile email is finalized.
4. Callback sync updates `profiles.email` only when auth email matches `pending_email`.
5. Canceling a pending change clears pending columns and reverts auth email to canonical profile email.

Behavior when verification is not completed:
- `profiles.email` remains unchanged.
- `pending_email` remains set until verification or explicit cancel.
- Old/stale verification links resolve deterministically without silently applying canceled state.

Invitation interaction:
- Invitation acceptance validates against the current session email.
- If session email does not match invitation email (including unresolved email-change state), acceptance returns `invalid`.

### Invitation Lifecycle

Statuses:
- `pending`: invite can be accepted before `expires_at`.
- `accepted`: invite was consumed; repeated acceptance returns `already_accepted`.
- `revoked`: owner revoked the invite.
- `expired`: modeled in schema; current runtime treats expired pending invites as invalid when `expires_at <= now()`.

Lifecycle rules:
- Tokens are stored as SHA-256 hashes (`token_hash`), never raw values.
- Acceptance is idempotent (`accepted` and `already_accepted` are safe outcomes).
- Email mismatch returns `invalid`.
- Delayed acceptance is supported via httpOnly invite cookies persisted for up to 7 days.
- Invalid/expired/revoked tokens redirect to `/invite/invalid` and clear invite cookies.

### Password Reset and Invite Interaction

- Password reset sends recovery links to `/update-password`.
- After password update, auth flow goes through `/auth/post-auth`.
- `/auth/post-auth` prioritizes invite completion when invite cookies are present, so invite context survives reset/sign-in/sign-up transitions.
- Expired/invalid invite tokens are handled deterministically (invalid screen + cookie clear).
- Double-accept attempts are safe due to idempotent acceptance handling.

---

## Security Baseline Documentation

### Intended Security Headers

The following headers are required for production hardening (documented baseline; not yet configured in `next.config.ts`):
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `X-Frame-Options`
- `Referrer-Policy`
- `X-Content-Type-Options`

### Rate Limiting Strategy (High Level)

Planned controls:
- Sign up: per-IP and per-email throttling to limit account creation abuse.
- Sign in: per-IP and per-account throttling with escalating cooldown for brute-force resistance.
- Password reset: per-IP and per-email throttling to prevent enumeration and mail abuse.
- Invite acceptance: per-token and per-IP throttling to reduce token brute force and replay noise.

Implementation guidance:
- Enforce limits server-side at auth and invite entry points.
- Record allow/deny decisions with timestamps for abuse investigations.
- Return generic error responses to avoid account/token enumeration.

---

## Production Readiness Checklist

- [ ] Backups: backup frequency, retention, and restore drill documented.
- [ ] Monitoring: uptime, latency, and database health monitoring enabled.
- [ ] Error tracking: centralized error reporting for client and server.
- [ ] Webhook logging: structured webhook request/response + dedupe outcomes.
- [ ] Trial expiry handling: deterministic transition to read-only when trial expires.
- [ ] Subscription cancellation behavior: clear UX and status transition handling.
- [ ] GDPR considerations: lawful basis, retention windows, and data access/deletion policy.
- [ ] Data deletion flow: verified end-to-end deletion for user/company lifecycle paths.

---

## Known Issues & Workarounds

### 1. Next.js 16 Middleware Deprecation Warning
```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

**Status:** Warning only, middleware still works
**Action:** Ignore for now, will migrate when Supabase docs update
**Impact:** None - auth works correctly

### 2. Next.js 16 Async Cookies
**Issue:** `cookies()` is now async in Next.js 16
**Solution:** Already implemented in our Supabase clients
**Pattern to follow:** Always `await cookies()` in server-side code

---

## References

### Documentation Files
- Sprint 0 Overview: `/docs/sprint-0-overview.md`
- Summit Features Specification: `/docs/summit-features-specification.md`
- Database Schema: `/docs/database-schema.md`

### External Resources
- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- Supabase SSR Guide: https://supabase.com/docs/guides/auth/server-side/nextjs
- Next.js 16 Docs: https://nextjs.org/docs
- shadcn/ui: https://ui.shadcn.com
- Mollie API: https://docs.mollie.com

---

## Questions & Clarifications

If you need clarification on any architectural decision or pattern:

1. **Company model:** One user = one company (email is unique globally)
2. **Roles:** Owner vs Member (members have full data access)
3. **Subscription:** Per company, not per user
4. **Trial:** 14 days, product rule is post-verification start (current DB timestamp is set at signup; see access matrix notes)
5. **Version 1 scope:** Fixed-bid projects with milestones ONLY

---

**This document should be updated as development progresses.**
