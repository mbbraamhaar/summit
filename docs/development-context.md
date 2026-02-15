# Summit - Development Context

**Last Updated:** February 15, 2026  
**Current Sprint:** Sprint 0 (Technical Foundation)  
**Status:** Database complete, Authentication system next

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

### 1. Multi-Tenancy Model: Single Workspace Per User

**CRITICAL:** This is NOT a traditional multi-workspace model.

**The Model:**
- One user = one workspace (forever)
- Email address is globally unique (can't join another workspace)
- When user signs up → auto-creates workspace → becomes owner
- Owners can invite members to THEIR workspace
- Members have full data access (create clients, projects, invoices)
- Owners control billing, invites, and workspace settings

**Why this matters:**
- Simpler schema (no complex workspace_members join table)
- Clearer ownership model
- Still multi-tenant (complete workspace isolation via RLS)
- Each workspace has own subscription

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
- ❌ Cannot delete workspace

### 3. Trial & Subscription Model

**Trial Period:** 14 days (starts after email verification)
- User signs up → email verification → trial starts
- Workspace status: `trial`
- Full access during trial

**Subscription:**
- Tied to workspace, not individual users
- One plan: "Summit Pro" (monthly or yearly)
- Monthly: €15/month (note: we seeded with 15.00, not 29.00)
- Yearly: €150/year
- When trial ends or payment fails: access blocked but data readable

**Access Control:**
- `workspace.status` = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
- `trial` or `active` → full access
- `past_due`, `suspended`, `canceled` → read-only access (can log in, view data, cannot create/edit)

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

#### `workspaces`
```sql
- id (uuid, pk)
- name (text)
- slug (text, unique)
- status (text) - 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
- trial_ends_at (timestamp)
- created_at (timestamp)
- updated_at (timestamp)
```

#### `profiles`
```sql
- id (uuid, pk, references auth.users)
- workspace_id (uuid, references workspaces)
- email (text, unique)
- full_name (text, nullable)
- avatar_url (text, nullable)
- role (text) - 'owner' | 'member'
- created_at (timestamp)
- updated_at (timestamp)
```

**Key relationships:**
- One profile = one workspace (1:1 via workspace_id)
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
- workspace_id (uuid, references workspaces, unique)
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

**Important:** One subscription per workspace (enforced by unique constraint on workspace_id)

### Database Triggers

#### Auto-create workspace and profile on signup
```sql
-- Function: handle_new_user()
-- Trigger: on_auth_user_created (after insert on auth.users)
-- Does:
--   1. Generates unique workspace slug from email
--   2. Creates workspace with 14-day trial
--   3. Creates profile linked to workspace as owner
```

#### Auto-update timestamps
```sql
-- Function: update_updated_at_column()
-- Triggers on: profiles, workspaces, subscriptions
```

### RLS Policies (Row Level Security)

**ALL tables have RLS enabled.** Key policies:

#### Profiles
- Users can view profiles in their workspace
- Users can update their own profile
- Owners can insert new members (invitations)
- Owners can delete members (but not themselves)

#### Workspaces
- Users can view their own workspace
- Owners can update their workspace

#### Plans
- Anyone can view active plans (for pricing page)

#### Subscriptions
- Users can view their workspace's subscription
- Owners can manage subscriptions

---

## Project Structure

```
summit/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (sign-in, sign-up, etc.) - TO BUILD
│   ├── (dashboard)/       # Protected dashboard routes - TO BUILD
│   ├── api/               # API routes
│   │   └── webhooks/      # Mollie webhooks - TO BUILD
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/
│   ├── ui/                # shadcn/ui components (install on-demand)
│   ├── auth/              # Auth-specific components - TO BUILD
│   ├── billing/           # Billing/subscription components - TO BUILD
│   ├── summit/            # Custom domain components - TO BUILD LATER
│   └── layout/            # Layout components (nav, sidebar) - TO BUILD
├── lib/
│   ├── supabase/
│   │   ├── server.ts      # ✅ DONE - Server-side client (async)
│   │   └── client.ts      # ✅ DONE - Browser client
│   ├── auth/              # Auth helpers - TO BUILD
│   ├── subscriptions/     # Subscription helpers - TO BUILD
│   ├── mollie/            # Mollie client - TO BUILD
│   └── utils.ts           # ✅ DONE - cn() helper (from shadcn)
├── types/
│   └── database.ts        # ✅ DONE - Generated from Supabase
├── hooks/                 # Custom React hooks - TO BUILD AS NEEDED
├── middleware.ts          # ✅ DONE - Session refresh (has deprecation warning)
├── .cursorrules           # ✅ DONE - Coding conventions
├── .env.local             # ✅ DONE - Local env vars (not in git)
└── .env.example           # ✅ DONE - Template (in git)
```

---

## Environment Variables

### Current Configuration (`.env.local`)

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
```

**Security notes:**
- Service role key NEVER goes client-side
- Only use anon key in browser
- Mollie keys will be added when we integrate payments

---

## What We've Completed (Sprint 0 Progress)

### ✅ Development Environment
- [x] GitHub repository with main/develop branches
- [x] Next.js 16 with TypeScript (strict) and Tailwind
- [x] shadcn/ui initialized (components to be added on-demand)
- [x] Prettier configured
- [x] ESLint configured
- [x] Cursor IDE settings configured
- [x] `.cursorrules` file created

### ✅ Database & Types
- [x] Supabase project created
- [x] Database schema designed and implemented
- [x] RLS policies created
- [x] Database triggers created (auto-create workspace/profile)
- [x] TypeScript types generated from schema
- [x] Initial plans seeded (Summit Pro monthly/yearly)

### ✅ Supabase Integration
- [x] Server-side client (`lib/supabase/server.ts`) - async for Next.js 16
- [x] Browser client (`lib/supabase/client.ts`)
- [x] Middleware for session refresh (`middleware.ts`)
- [x] Database connection tested and working

### ⏳ Still To Build (Rest of Sprint 0)

#### 1. Authentication System (NEXT - HIGH PRIORITY)
- [ ] Sign up flow with email verification
- [ ] Sign in page
- [ ] Sign out functionality
- [ ] Password reset flow
- [ ] Email verification handling
- [ ] Auth helper functions (`lib/auth/helpers.ts`)
- [ ] Protected route patterns

#### 2. User Profile Management
- [ ] Profile page (view/edit)
- [ ] Avatar upload (Supabase Storage)
- [ ] Profile editing form

#### 3. Workspace System
- [ ] Workspace context/provider (for switching/displaying current workspace)
- [ ] Workspace settings page
- [ ] Member invitation system (owner only)
- [ ] Member management UI (owner only)

#### 4. Subscription & Billing
- [ ] Mollie integration setup
- [ ] Subscription checkout flow
- [ ] Webhook handler (`app/api/webhooks/mollie/route.ts`)
- [ ] Billing page (view subscription, payment history)
- [ ] Subscription management (upgrade, cancel)
- [ ] Access control based on workspace status

#### 5. Security & Compliance
- [ ] Security headers in `next.config.ts`
- [ ] Terms of service page
- [ ] Privacy policy page
- [ ] Cookie consent banner (if needed for EU)
- [ ] Data deletion endpoint (GDPR compliance)

#### 6. Error Handling & Polish
- [ ] Global error boundary (`app/error.tsx`)
- [ ] Loading states (`app/loading.tsx`)
- [ ] 404 page (`app/not-found.tsx`)
- [ ] Toast notification system (use shadcn/ui toast)

---

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

## Next Steps for Claude Code

### Immediate Priority: Authentication System

Build the complete authentication flow:

1. **Create auth pages:**
   - `app/(auth)/sign-up/page.tsx` - Sign up form
   - `app/(auth)/sign-in/page.tsx` - Sign in form
   - `app/(auth)/reset-password/page.tsx` - Password reset request
   - `app/(auth)/update-password/page.tsx` - Set new password
   - `app/(auth)/verify-email/page.tsx` - Email verification handler

2. **Create auth helpers:**
   - `lib/auth/helpers.ts` - getCurrentUser, requireAuth, requireOwner, etc.

3. **Create auth components:**
   - `components/auth/sign-up-form.tsx` - Sign up form with validation
   - `components/auth/sign-in-form.tsx` - Sign in form
   - `components/auth/reset-password-form.tsx` - Password reset form

4. **Create protected route example:**
   - `app/(dashboard)/dashboard/page.tsx` - Dashboard landing page (protected)
   - `app/(dashboard)/layout.tsx` - Dashboard layout with nav

5. **Add shadcn/ui components as needed:**
   - `npx shadcn@latest add form` - For auth forms
   - `npx shadcn@latest add input` - Form inputs
   - `npx shadcn@latest add button` - Buttons
   - `npx shadcn@latest add label` - Form labels
   - `npx shadcn@latest add card` - Card containers
   - `npx shadcn@latest add toast` - Notifications

### Key Requirements for Auth System

**Sign Up Flow:**
1. User fills form (email, password, full_name)
2. Create auth.user via Supabase Auth
3. Trigger automatically creates workspace + profile (via DB trigger)
4. Send verification email
5. Redirect to "check your email" page

**Sign In Flow:**
1. User enters email/password
2. Supabase Auth validates
3. Set session cookies
4. Redirect to /dashboard

**Email Verification:**
1. User clicks link in email
2. Supabase verifies email
3. Trial period starts (14 days)
4. Redirect to /dashboard

**Password Reset:**
1. User requests reset
2. Email sent with reset link
3. User sets new password
4. Redirect to /sign-in

---

## Testing Checklist

Before moving to next phase, verify:

### Authentication
- [ ] Can sign up with email/password
- [ ] Receive verification email
- [ ] Email verification works
- [ ] Can sign in after verification
- [ ] Can sign out
- [ ] Can request password reset
- [ ] Can set new password
- [ ] Protected routes redirect unauthenticated users
- [ ] Session persists across page reloads

### Database
- [ ] Workspace auto-created on signup
- [ ] Profile auto-created with correct role (owner)
- [ ] Workspace slug is unique
- [ ] Trial period set to 14 days
- [ ] RLS policies work (can only see own workspace data)

### UI/UX
- [ ] Forms validate inputs
- [ ] Error messages display clearly
- [ ] Loading states show during async operations
- [ ] Toast notifications work for success/error
- [ ] Redirects work correctly

---

## References

### Documentation Files
- Sprint 0 Technical Foundation: `/docs/sprint-0-technical-foundation.md`
- Summit Features Specification: `/docs/summit-features-specification.md`
- Database Schema: `/docs/database-schema.md` (to be created)

### External Resources
- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- Supabase SSR Guide: https://supabase.com/docs/guides/auth/server-side/nextjs
- Next.js 16 Docs: https://nextjs.org/docs
- shadcn/ui: https://ui.shadcn.com
- Mollie API: https://docs.mollie.com

---

## Questions & Clarifications

If you need clarification on any architectural decision or pattern:

1. **Workspace model:** One user = one workspace (email is unique globally)
2. **Roles:** Owner vs Member (members have full data access)
3. **Subscription:** Per workspace, not per user
4. **Trial:** 14 days, starts after email verification
5. **Version 1 scope:** Fixed-bid projects with milestones ONLY

---

**This document should be updated as development progresses.**
