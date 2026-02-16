# Sprint 0: Technical Foundation - Overview

**Status:** In Progress (Day 5 of 10)  
**Last Updated:** February 16, 2026

## Overview

Sprint 0 establishes the core technical infrastructure for Summit: development environment, database, authentication, and subscription framework. By the end of Sprint 0, we'll have a secure, production-ready foundation ready for building core features.

---

## Sprint Goals

- ✅ Production-ready development environment
- ✅ Database schema with multi-tenancy and RLS
- ✅ Secure authentication and session management
- ⏳ Subscription and payment infrastructure
- ⏳ Security and compliance baseline

---

## Progress Summary

### Completed: Days 1-5
- ✅ Development environment setup
- ✅ Database schema and Supabase integration
- ✅ Authentication system

### Remaining: Days 6-10
- ⏳ Profile management (email change with re-verification)
- ✅ Workspace system (member invitations + acceptance)
- ⏳ Subscription & billing (Mollie)
- ⏳ Security & compliance

---

## Detailed Checklists

### 1. Development Environment Setup ✅

**IDE & Repository:**
- [x] Cursor IDE with recommended extensions
- [x] `.cursor/settings.json` configured
- [x] `.cursorrules` file created
- [x] GitHub repository created
- [x] Main/develop branch strategy
- [x] `.gitignore` configured
- [x] README with setup instructions

**Next.js Project:**
- [x] Next.js 16+ with App Router initialized
- [x] TypeScript with strict mode
- [x] Tailwind CSS configured
- [x] shadcn/ui initialized (components installed on-demand)
- [x] Prettier configured (`.prettierrc`)
- [x] ESLint configured

**Environment Variables:**
- [x] `.env.example` created
- [x] `.env.local` configured (gitignored)
- [x] Supabase environment variables set

---

### 2. Database & Supabase Integration ✅

**Supabase Setup:**
- [x] Supabase project created
- [x] Supabase client libraries installed (`@supabase/supabase-js`, `@supabase/ssr`)
- [x] Server-side client configured (`lib/supabase/server.ts`)
- [x] Browser client configured (`lib/supabase/client.ts`)
- [x] Middleware for session refresh (`middleware.ts`)
- [x] TypeScript types generated (`types/database.ts`)

**Database Schema:**
- [x] `workspaces` table (tenant container)
- [x] `profiles` table (user profiles with workspace_id and role)
- [x] `plans` table (subscription plans)
- [x] `subscriptions` table (workspace subscriptions)
- [x] RLS policies enabled on all tables
- [x] Database triggers (auto-create workspace/profile on signup)
- [x] Seeded data (Summit Pro monthly/yearly plans)

**Key Decisions:**
- One workspace per user (email globally unique)
- Owner vs Member roles (members have full data access)
- 14-day trial period starting after email verification
- Workspace status tracks: trial | active | past_due | suspended | canceled

---

### 3. Authentication & User Management ✅

**Authentication Flow:**
- [x] Sign up page with form validation
- [x] Sign in page
- [x] Sign out functionality
- [x] Password reset request page
- [x] Password update page (after reset link)
- [x] Email verification handler (`/auth/callback`)
- [x] Email verification success page
- [x] Invite acceptance survives sign-in/sign-up/reset-password/update-password transitions

**Auth Infrastructure:**
- [x] Auth helper functions (`lib/auth/helpers.ts`)
  - getCurrentUser()
  - getCurrentProfile()
  - requireAuth()
  - requireOwner()
  - canAccessWorkspace()
- [x] Protected route patterns (dashboard layout)
- [x] Session management via middleware

**UI Components:**
- [x] Sign-up form with Zod validation
- [x] Sign-in form
- [x] Password reset form
- [x] Password update form
- [x] Dashboard navigation with sign-out
- [x] Toast notifications (shadcn/ui)

**shadcn/ui Components Installed:**
- [x] form
- [x] input
- [x] button
- [x] label
- [x] card
- [x] toast
- [x] toaster (added to root layout)

---

### 4. User Profile Management ⏳

**Profile Pages:**
- [x] Profile viewing page (`/profile`)
- [x] Profile editing form
- [x] Avatar upload and removal interface
- [x] Top-nav avatar rendering with initials fallback

**Profile Features:**
- [x] Update full name
- [ ] Update email (with re-verification)
- [x] Upload avatar to Supabase Storage
- [x] Remove avatar (revert to initials fallback)
- [x] Supabase Storage bucket + policies for avatars

**Estimated Time:** 1 day

---

### 5. Workspace System ⏳

**Workspace Settings:**
- [x] Workspace settings page (`/settings`)
- [x] Workspace name editing (owner only)
- [x] Workspace deletion (owner only, with confirmation)

**Member Management:**
- [x] Member invitation system (owner only)
  - [x] Invite member by email
  - [x] Generate invitation tokens
  - [x] Email invitation link
  - [x] Canonical invite entry (`/invite?token=...`) with httpOnly invite cookie
  - [x] Unified acceptance endpoint (`/invite/accept`) with idempotent processing
  - [x] Delayed click support via invite cookie persistence (7 days)
  - [x] Handle invitation acceptance with session email validation
- [x] Member list view
- [x] Remove member functionality (owner only)
- [x] Removal lifecycle email
- [x] Role display (owner vs member badge)

**Authorization UI:**
- [x] Show/hide features based on role
- [x] Owner-only UI controls
- [x] Member permission messaging

**Estimated Time:** 2 days

---

### 6. Subscription & Billing (Mollie) ⏳

**Mollie Setup:**
- [ ] Mollie account created
- [ ] Test API keys obtained
- [ ] Mollie SDK installed (`@mollie/api-client`)
- [ ] Mollie client configured (`lib/mollie/client.ts`)

**Subscription Flow:**
- [ ] Pricing page showing plans
- [ ] Subscription checkout flow
  - [ ] Create Mollie customer
  - [ ] Create Mollie subscription
  - [ ] Redirect to Mollie checkout
  - [ ] Handle return from checkout
- [ ] Subscription confirmation page

**Webhook Handler:**
- [ ] Webhook endpoint (`/api/webhooks/mollie/route.ts`)
- [ ] Webhook signature verification
- [ ] Idempotent webhook processing
- [ ] Handle payment.paid event
- [ ] Handle subscription.created event
- [ ] Handle subscription.updated event
- [ ] Handle subscription.cancelled event
- [ ] Update workspace status based on subscription

**Billing UI:**
- [ ] Billing page (`/billing`)
- [ ] Current plan display
- [ ] Subscription status display
- [ ] Trial countdown (if in trial)
- [ ] Upgrade/downgrade options
- [ ] Cancel subscription (with confirmation)
- [ ] Payment history view

**Access Control:**
- [ ] Feature gating based on workspace status
- [ ] Read-only mode for suspended/past_due workspaces
- [ ] Trial expiration handling
- [ ] Subscription helper functions (`lib/subscriptions/helpers.ts`)

**Estimated Time:** 2-3 days

---

### 7. Security & Compliance ⏳

**Security Headers:**
- [ ] Configure security headers in `next.config.ts`
  - [ ] X-DNS-Prefetch-Control
  - [ ] Strict-Transport-Security (HSTS)
  - [ ] X-Frame-Options
  - [ ] X-Content-Type-Options
  - [ ] Referrer-Policy
  - [ ] Content-Security-Policy (CSP)

**Rate Limiting:**
- [ ] Rate limiting on sign-up endpoint
- [ ] Rate limiting on sign-in endpoint (prevent brute force)
- [ ] Rate limiting on password reset endpoint

**Error Handling:**
- [ ] Global error boundary (`app/error.tsx`)
- [ ] 404 page (`app/not-found.tsx`)
- [ ] Loading states (`app/loading.tsx`)
- [ ] Secure error logging (no sensitive data)

**Compliance Pages:**
- [ ] Terms of service page (`/terms`)
- [ ] Privacy policy page (`/privacy`)
- [ ] Cookie consent banner (if needed for EU)

**GDPR Compliance:**
- [ ] Data deletion endpoint (`/api/user/delete`)
- [ ] Cascade delete user data on account deletion
- [ ] Export user data endpoint (optional)

**Audit Logging (Optional for Sprint 0):**
- [ ] Audit log table schema
- [ ] Log critical events (sign-ups, role changes, deletions)

**Estimated Time:** 1-2 days

---

## Success Criteria

By the end of Sprint 0, the following must work:

### Authentication ✅
- [x] New user can sign up with email/password
- [x] Email verification email sent
- [x] User can verify email via link
- [x] Workspace and profile auto-created on signup
- [x] User can sign in with verified account
- [x] User can reset password via email
- [x] User can sign out
- [x] Session persists across page reloads
- [x] Unauthenticated users redirected from /dashboard

### Database & Security ✅
- [x] Company created with 14-day trial
- [x] Profile created with role='owner'
- [x] RLS policies prevent cross-company data access
- [x] Users can only see their own workspace data
- [x] Service role key never exposed client-side

### Remaining Success Criteria ⏳
- [x] User can edit profile and upload avatar
- [x] Owner can invite members to workspace
- [x] Owner can remove members from workspace
- [ ] Users can subscribe to a plan via Mollie
- [ ] Subscription status correctly gates feature access
- [ ] Webhooks process payments idempotently
- [ ] Security headers configured
- [ ] Terms and privacy pages exist
- [ ] Application deployable to production (Vercel)

---

## Technical Stack

**Framework & Languages:**
- Next.js 16.1.6 (App Router)
- TypeScript (strict mode)
- React 19

**Styling:**
- Tailwind CSS
- shadcn/ui (components installed on-demand)

**Database & Auth:**
- Supabase (PostgreSQL with RLS)
- Supabase Auth (cookie-based sessions)

**Payments:**
- Mollie (test mode during development)

**Deployment:**
- Vercel (not deployed yet)

---

## Key Architectural Decisions

### Multi-Tenancy Model
- **One workspace per user** - Email is globally unique
- **Workspace isolation** - All queries filtered by workspace_id via RLS
- **No multi-workspace** - Users cannot belong to multiple workspaces

### Role Model
- **Owner** - Full permissions (billing, member management, all data operations)
- **Member** - Full data permissions (create/edit clients, projects, invoices) but no billing/admin access

### Trial & Subscription
- **14-day trial** - Starts after email verification
- **Per-workspace billing** - Subscription tied to workspace, not individual users
- **One tier to start** - Summit Pro (€15/month or €150/year)
- **Access control** - Read-only when suspended/past_due, blocked when canceled

### Next.js 16 Patterns
- **Async cookies API** - Required for Next.js 16 (`await cookies()`)
- **Server Components by default** - Add 'use client' only when needed
- **Cookie-based sessions** - httpOnly cookies via @supabase/ssr

---

## Related Documentation

For detailed implementation guidance, see:

- **`development-context.md`** - Current state, decisions, and context
- **`database-schema.md`** - Complete database reference
- **`cursor-prompt-authentication.md`** - Auth implementation guide (completed)
- **Future:** cursor-prompt-profile.md, cursor-prompt-billing.md, etc.

---

## Timeline

- **Days 1-2:** Environment setup ✅
- **Days 3-4:** Database schema and Supabase ✅
- **Day 5:** Authentication system ✅
- **Day 6:** Profile management ✅
- **Days 7-8:** Workspace system and member invitations ✅
- **Days 9:** Subscription & billing (Mollie) ⏳
- **Day 10:** Security, compliance, testing ⏳

**Total: 10 working days** (7 complete, 3 remaining)

---

## Next Steps

**Immediate Next:** Start billing foundation + hardening
1. Billing scaffold (Mollie client + checkout entry point)
2. Subscription status feature-gating hooks
3. Add invite/auth lifecycle tests (including reset-password and delayed invite acceptance)

**After Profile:** Choose between:
- Workspace system (member invitations)
- Subscription & billing (Mollie)
- Security & compliance

Recommended order: Workspace → Security → Billing
Recommended order: Security → Billing

---

**Last Updated:** February 16, 2026  
**Sprint 0 Progress:** 70% complete (7 of 10 days)
