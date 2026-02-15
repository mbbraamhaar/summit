# Sprint 0: Technical Foundation (Updated)

**Last Updated:** February 15, 2026  
**Status:** Partially Complete - Database ✅, Authentication Next

## Overview
This sprint focuses on establishing the core technical infrastructure, authentication system, and subscription framework. By the end of Sprint 0, you'll have a secure, production-ready foundation that supports user management, role-based access control, and subscription handling.

## Sprint Goals
- Production-ready development environment ✅
- Secure authentication and authorization system ⏳
- Subscription and payment infrastructure ⏳
- Security and compliance baseline ⏳

---

## What We've Completed

### ✅ Development Environment Setup

#### IDE Configuration
- [x] Cursor IDE installed with recommended extensions
- [x] `.cursor/settings.json` configured
- [x] `.cursorrules` file created
- [x] Cursor AI features configured

#### Repository & Version Control
- [x] GitHub repository created (`summit`)
- [x] Main/develop branch strategy set up
- [x] `.gitignore` configured for Next.js and sensitive files
- [x] README with setup instructions

#### Next.js Project Setup
- [x] Next.js **16.1.6** with App Router (note: using Next.js 16, not 14)
- [x] TypeScript with strict mode
- [x] Tailwind CSS configured
- [x] Environment variables structure (`.env.local`, `.env.example`)
- [x] Folder structure established:
  - `/app` - routes and pages
  - `/components` - reusable UI components
  - `/lib` - utilities and configurations
  - `/types` - TypeScript definitions
  - `/hooks` - custom React hooks (to be created as needed)

**Note on Next.js 16:**
We're using Next.js 16.1.6 which requires async `cookies()` calls. All code examples have been updated accordingly.

#### Supabase Configuration
- [x] Supabase project created
- [x] Database connection established
- [x] Supabase client libraries installed: `@supabase/supabase-js`, `@supabase/ssr`
- [x] Supabase Auth configured with cookie-based sessions
- [x] Environment variables set up
- [x] TypeScript types generated: `types/database.ts`

---

## 1. Development Environment Setup

### Cursor IDE Configuration Files

#### `.cursor/settings.json`
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ],
  "editor.quickSuggestions": {
    "strings": true
  },
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "files.autoSave": "onFocusChange",
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "cursor.general.enableCursorComposer": true,
  "cursor.composer.autoAcceptDelay": 3000,
  "cursor.composer.showInlineCompletions": true,
  "cursor.cmdk.useTheming": true,
  "cursor.general.enableDiffView": true
}
```

#### `.cursorrules`
```
# Tech Stack
Next.js 16+ (App Router), TypeScript (strict), Tailwind, Supabase, Mollie

# Critical Conventions
- Server Components by default; add 'use client' only when required
- Supabase clients:
  - Server: createServerClient with cookie-based sessions (@supabase/ssr)
  - Browser: createBrowserClient only for RLS-safe reads/writes
- Middleware refreshes Supabase session cookies (SSR pattern)
- Never expose service_role key client-side
- Enable RLS on ALL tables; enforce authorization in policies, not app-level checks
- Named exports preferred EXCEPT where Next.js requires default exports (page/layout/loading/error)
- Structure: /app (routes), /components (UI), /lib (utils), /types, /hooks

# Supabase Auth
- Protected operations must be server-side (Route Handlers / Server Actions)
- Auth/session source of truth is httpOnly cookies (no localStorage-as-truth patterns)

# Mollie Payments
- Verify webhook authenticity (signature or token mechanism supported by Mollie)
- Store mollie_customer_id and mollie_subscription_id in DB
- Use Mollie test mode during development
- Webhooks must be idempotent:
  - On webhook, fetch the Mollie resource (payment/subscription) via API
  - Apply state transitions (paid/active/cancelled/etc) based on fetched status

# Security
- Validate input server-side (use Zod)
- Return 401 when unauthenticated; 403 when authenticated but not authorized
- Secrets via env vars; NEXT_PUBLIC_* only for truly public values

# Styling
- Tailwind only (no CSS modules / inline styles)
- Use cn() for conditional classes
```

#### `.prettierrc`
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "arrowParens": "avoid"
}
```

---

## 2. Database Schema (Completed)

### Architecture Decision: Simplified Multi-Tenancy

**IMPORTANT:** We implemented a simplified single-workspace-per-user model:
- One user = one workspace (forever)
- Email addresses are globally unique
- No complex workspace_members join table
- Still fully multi-tenant (complete workspace isolation via RLS)

### Workspaces Table
```sql
create table workspaces (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text unique not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'suspended', 'canceled')),
  trial_ends_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table workspaces enable row level security;
```

**Key fields:**
- `status` - Tracks subscription state (trial → active/past_due/canceled)
- `trial_ends_at` - 14 days from signup (starts after email verification)

### Profiles Table
```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  workspace_id uuid references workspaces on delete cascade not null,
  email text not null unique,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table profiles enable row level security;
```

**Key differences from original spec:**
- Added `workspace_id` (1:1 relationship)
- Email is globally unique (one user = one workspace)
- Role is `owner` or `member` (not admin/user/viewer)
- No `mollie_customer_id` (moved to subscriptions table)

### Plans Table
```sql
create table plans (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  price numeric(10,2) not null,
  interval text not null check (interval in ('month', 'year')),
  features jsonb,
  mollie_plan_id text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table plans enable row level security;
```

**Seeded plans:**
- Summit Pro Monthly: €15/month
- Summit Pro Yearly: €150/year

### Subscriptions Table
```sql
create table subscriptions (
  id uuid default uuid_generate_v4() primary key,
  workspace_id uuid references workspaces on delete cascade not null unique,
  plan_id uuid references plans on delete restrict not null,
  status text not null check (status in ('active', 'canceled', 'past_due', 'suspended')),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false,
  mollie_subscription_id text unique,
  mollie_customer_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table subscriptions enable row level security;
```

**Key difference:** Linked to `workspace_id` (not `user_id`)

### Database Triggers

#### Auto-create workspace and profile on signup
```sql
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_workspace_id uuid;
  workspace_slug text;
begin
  -- Generate unique slug from email
  workspace_slug := split_part(new.email, '@', 1) || '-' || substring(new.id::text from 1 for 8);
  
  -- Create workspace with 14-day trial
  insert into public.workspaces (name, slug, status, trial_ends_at)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s Workspace',
    workspace_slug,
    'trial',
    timezone('utc'::text, now()) + interval '14 days'
  )
  returning id into new_workspace_id;
  
  -- Create profile as owner
  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (
    new.id,
    new_workspace_id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'owner'
  );
  
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

#### Auto-update timestamps
```sql
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Applied to profiles, workspaces, subscriptions
```

### Row Level Security Policies

See `/docs/database-schema.md` for complete RLS policies.

**Key pattern:**
```sql
-- Users can only see data in their workspace
using (
  workspace_id = (
    select workspace_id from profiles where id = auth.uid()
  )
)
```

---

## 3. Supabase Client Setup (Completed)

### Server-side client (`/lib/supabase/server.ts`)

**Updated for Next.js 16:**
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies() // Note: async in Next.js 16

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          return cookieStore.get(name)?.value
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle error
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  )
}
```

### Browser client (`/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Middleware (`middleware.ts`)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Note:** Middleware shows deprecation warning in Next.js 16 but still functions correctly.

---

## What's Left To Build

### 2. Authentication & User Management

- [ ] Sign up page with email verification
- [ ] Sign in page
- [ ] Password reset flow
- [ ] Email verification handler
- [ ] Session management (already handled by middleware)
- [ ] Protected route examples
- [ ] Auth helper functions (`lib/auth/helpers.ts`)

### 3. Authorization & Access Control

Role implementation:
- **Owner**: Full permissions (billing, member management, all data)
- **Member**: Full data permissions (create/edit clients, projects, invoices) but NO billing or member management

- [ ] Authorization helper functions
- [ ] Protected route patterns
- [ ] Role-based UI components

### 4. User Profile Management

- [ ] Profile viewing page
- [ ] Profile editing form
- [ ] Avatar upload (Supabase Storage bucket setup)

### 5. Workspace System

- [ ] Workspace settings page
- [ ] Member invitation system (owner only)
- [ ] Member management UI (owner only)
- [ ] Workspace context/provider

### 6. Subscriptions & Billing (Mollie)

- [ ] Mollie account setup
- [ ] Install Mollie SDK: `npm install @mollie/api-client`
- [ ] Mollie client setup (`/lib/mollie/client.ts`)
- [ ] Checkout flow
- [ ] Webhook handler (`/app/api/webhooks/mollie/route.ts`)
- [ ] Subscription management UI
- [ ] Access control based on workspace status
- [ ] Helper functions (`/lib/subscriptions/helpers.ts`)

### 7. Security & Compliance

- [ ] Security headers in `next.config.ts`
- [ ] Rate limiting on auth endpoints
- [ ] Error boundaries
- [ ] Terms of service page
- [ ] Privacy policy page
- [ ] Cookie consent banner
- [ ] Data deletion endpoint (GDPR)

---

## Deliverables Checklist

### Code & Configuration
- [x] GitHub repository with proper structure
- [x] Next.js app running locally and deployable
- [x] Supabase project configured with all tables
- [x] Environment variables documented in `.env.example`
- [x] Cursor IDE configured
- [x] Prettier and ESLint configured

### Database
- [x] Workspaces table with trial tracking
- [x] Profiles table with workspace_id
- [x] Plans table with seeded data
- [x] Subscriptions table
- [x] RLS policies on all tables
- [x] Auto-create workspace/profile trigger
- [x] TypeScript types generated

### Authentication (TO DO)
- [ ] Working sign up/sign in/sign out flow
- [ ] Password reset functional
- [ ] Email verification working
- [ ] Profile creation automatic (via trigger)
- [ ] Protected routes enforced
- [ ] Session refresh working

### Authorization (TO DO)
- [ ] Owner vs Member role enforcement
- [ ] Helper functions for auth checks
- [ ] UI shows/hides based on role

### Subscriptions (TO DO)
- [ ] Mollie integration working
- [ ] Users can subscribe to plans
- [ ] Subscription status reflects in UI
- [ ] Webhook handling functional and idempotent
- [ ] Access control based on workspace status

### Security (TO DO)
- [ ] Security headers configured
- [ ] Rate limiting implemented
- [ ] Error handling in place
- [ ] Service role key never exposed

### Compliance (TO DO)
- [ ] Terms of service page
- [ ] Privacy policy page
- [ ] Cookie consent (if needed)
- [ ] User data deletion capability

---

## Key Differences From Original Sprint 0 Doc

### Architecture Changes
1. **Simplified workspace model** - One user = one workspace
2. **Role model changed** - owner/member instead of admin/user/viewer
3. **Trial period** - 14 days (not 7)
4. **Next.js 16** - Async cookies API required

### Database Changes
1. **No workspace_members table** - Simplified to workspace_id in profiles
2. **Workspace status field** - Tracks trial/active/past_due/canceled
3. **Subscription linked to workspace** - Not user
4. **Email globally unique** - Enforces one workspace per user

### Technical Updates
1. **Next.js 16.1.6** - Not 14+
2. **Async Supabase server client** - Required for Next.js 16
3. **TypeScript types in types/database.ts** - Not types/supabase.ts

---

## Estimated Timeline (Updated)

**Completed (3 days):**
- ✅ Environment setup
- ✅ Database schema
- ✅ Supabase integration

**Remaining (~7 days):**
- Days 1-2: Authentication flows
- Days 3-4: Authorization and workspace system
- Day 5: User profile management
- Days 6-7: Mollie integration and subscriptions
- Day 8: Security and compliance
- Day 9: Testing and polish

**Total: 10 working days** (3 complete, 7 remaining)

---

## Success Criteria

### Completed
- ✅ Database schema implemented with proper isolation
- ✅ RLS policies enforce workspace boundaries
- ✅ Auto-creation of workspace + profile on signup
- ✅ Supabase clients configured for Next.js 16
- ✅ TypeScript types generated

### To Achieve
- [ ] User can sign up, verify email, and access dashboard
- [ ] Workspace created automatically with 14-day trial
- [ ] Users can only see their workspace data
- [ ] Owner can invite members
- [ ] Users can subscribe via Mollie
- [ ] Subscription status gates feature access
- [ ] Session management works correctly
- [ ] Code deployable to production

---

## Next Steps

**Immediate:** Build authentication system (see `/docs/cursor-prompt-authentication.md`)

**Then:** Profile management → Workspace system → Mollie integration → Security/compliance

---

## Resources

- Development Context: `/docs/development-context.md`
- Database Schema: `/docs/database-schema.md`
- Feature Specification: `/docs/summit-features-specification.md`
- Supabase Docs: https://supabase.com/docs
- Next.js 16 Docs: https://nextjs.org/docs
- Mollie API: https://docs.mollie.com
