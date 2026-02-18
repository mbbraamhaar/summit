# Summit - Database Schema Documentation

**Last Updated:** February 18, 2026  
**Database:** PostgreSQL via Supabase  
**Security:** Row Level Security (RLS) enabled on all tables

---

## Schema Overview

Summit uses a **simplified single-company-per-user multi-tenancy model**:
- Each user belongs to exactly ONE company
- Companies are completely isolated from each other
- Email addresses are globally unique
- RLS policies enforce company isolation at the database level

---

## Tables

### `companies`

Primary tenant table. Each company represents an isolated business/organization.

```sql
create table companies (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'suspended', 'canceled')),
  trial_ends_at timestamp with time zone,
  company_registration_id text,
  tax_id text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  bank_account_name text,
  bank_account_number text,
  bank_bic text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

**Fields:**
- `id` - Unique identifier
- `name` - Display name (e.g., "John's Company", "Acme Design Studio")
- `status` - Current subscription/trial status
  - `trial` - In 14-day trial period
  - `active` - Paid and active subscription
  - `past_due` - Payment failed, grace period
  - `suspended` - Access suspended (read-only)
  - `canceled` - Subscription canceled
- `trial_ends_at` - When trial period ends (set to signup + 14 days)
- `company_registration_id` - Official company registration number
- `tax_id` - Tax identification number
- `address_line1` - Invoice address line 1
- `address_line2` - Invoice address line 2
- `city` - Invoice city
- `postal_code` - Invoice postal code
- `country` - Invoice country
- `bank_account_name` - Bank account holder name
- `bank_account_number` - Bank account number (IBAN)
- `bank_bic` - Bank BIC/SWIFT code
- `created_at` - Company creation timestamp
- `updated_at` - Last modification timestamp (auto-updated by trigger)

**Indexes:**
- Primary key on `id`

**RLS Policies:**
```sql
-- Helper function used by policies to avoid recursive checks on profiles
create or replace function public.current_user_company_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select company_id from public.profiles where id = auth.uid() limit 1;
$$;

-- Users can view their own company
create policy "Users can view their company"
  on companies for select
  using (
    id = public.current_user_company_id()
  );

-- Owners can update their company
create policy "Owners can update company"
  on companies for update
  using (is_company_owner(id));
```

---

### `profiles`

User profile information. Links users to their company and defines their role.

```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  company_id uuid references companies on delete cascade not null,
  email text not null unique,
  pending_email text,
  pending_email_requested_at timestamp with time zone,
  pending_email_verification_sent_at timestamp with time zone,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

**Fields:**
- `id` - References `auth.users.id` (Supabase Auth user ID)
- `company_id` - The ONE company this user belongs to
- `email` - Email address (globally unique, enforced by unique constraint)
- `pending_email` - Requested new email awaiting verification (nullable)
- `pending_email_requested_at` - Timestamp when pending email was requested
- `pending_email_verification_sent_at` - Timestamp when last verification email was sent
- `full_name` - Display name (optional)
- `avatar_url` - Profile picture URL (Supabase Storage path, optional)
- `role` - User's role within their company
  - `owner` - Full permissions (billing, member management, all data operations)
  - `member` - Full data permissions (no billing or member management)
- `created_at` - Profile creation timestamp
- `updated_at` - Last modification timestamp (auto-updated by trigger)

**Relationships:**
- `id` → `auth.users.id` (1:1, cascade delete)
- `company_id` → `companies.id` (N:1, cascade delete)

**Constraints:**
- Email must be unique globally (one user can't have multiple companies)
- Pending email must also be unique when set (case-insensitive)
- Pending email cannot equal current email (case-insensitive)
- Role must be 'owner' or 'member'

**Indexes:**
- Primary key on `id`
- Unique constraint on `email`
- Partial unique index on `lower(pending_email)` where `pending_email` is not null

**RLS Policies:**
```sql
-- Users can view all profiles in their company
create policy "Users can view profiles in their company"
  on profiles for select
  using (
    company_id = public.current_user_company_id()
  );

-- Users can update their own profile
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Owners can insert new members (for invitations)
create policy "Owners can insert new members"
  on profiles for insert
  with check (is_company_owner(company_id));

-- Owners can delete members (but not themselves)
create policy "Owners can delete members"
  on profiles for delete
  using (is_company_owner(company_id) and id <> auth.uid());
```

---

### `invitations`

Invitation records for owner-managed member onboarding.

```sql
create table invitations (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references companies on delete cascade not null,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references profiles(id) on delete set null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

**Fields:**
- `company_id` - Target company for membership
- `email` - Invitee email (must match accepting session email)
- `token_hash` - SHA-256 hash of invite token
- `status` - `pending` | `accepted` | `expired` | `revoked`
- `invited_by` - Profile ID of inviter (nullable, set null on profile deletion)
- `expires_at` - Expiration timestamp for pending invite validity

**Constraints & Indexes:**
- Unique constraint on `token_hash`
- Partial unique index: one pending invite per `(company_id, lower(email))`
- Index on `company_id`
- Index on `email`
- Composite index on `(status, expires_at)`

**RLS Policies:**
```sql
-- Owners can create invitations for their company
create policy "Owners can create invitations"
  on invitations for insert
  with check (is_company_owner(company_id) and status = 'pending');

-- Owners can update invitations for their company
create policy "Owners can update invitations"
  on invitations for update
  using (is_company_owner(company_id))
  with check (is_company_owner(company_id));

-- Owners can view invitations for their company
create policy "Owners can view company invitations"
  on invitations for select
  using (is_company_owner(company_id));
```

---

### `plans`

Subscription plan catalog. Defines available pricing tiers.

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
```

**Fields:**
- `id` - Unique identifier
- `name` - Plan name (e.g., "Summit Pro")
- `description` - Marketing description
- `price` - Price in euros (numeric for precision)
- `interval` - Billing interval ('month' or 'year')
- `features` - JSON array of feature strings (for display on pricing page)
- `mollie_plan_id` - Mollie API plan identifier (nullable, set when Mollie integration active)
- `is_active` - Whether plan is available for purchase
- `created_at` - Plan creation timestamp

**Current Seeded Data:**
```json
[
  {
    "name": "Summit Pro",
    "description": "Full access to Summit features",
    "price": 15.00,
    "interval": "month",
    "features": ["Unlimited clients", "Unlimited projects", "Unlimited invoices", "Team collaboration", "Email support"]
  },
  {
    "name": "Summit Pro",
    "description": "Full access to Summit features (yearly)",
    "price": 150.00,
    "interval": "year",
    "features": ["Unlimited clients", "Unlimited projects", "Unlimited invoices", "Team collaboration", "Email support", "2 months free"]
  }
]
```

**RLS Policies:**
```sql
-- Anyone can view active plans (needed for pricing page)
create policy "Active plans are viewable by everyone"
  on plans for select
  using (is_active = true);
```

---

### `subscriptions`

Active subscriptions. Links companies to their paid plans.

```sql
create table subscriptions (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references companies on delete cascade not null unique,
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
```

**Fields:**
- `id` - Unique identifier
- `company_id` - Company this subscription belongs to (ONE subscription per company)
- `plan_id` - Plan being subscribed to
- `status` - Current subscription status
  - `active` - Paid and active
  - `canceled` - User canceled (may still be active until period end)
  - `past_due` - Payment failed, in grace period
  - `suspended` - Access suspended
- `current_period_start` - Start of current billing period
- `current_period_end` - End of current billing period
- `cancel_at_period_end` - If true, don't renew after current period
- `mollie_subscription_id` - Mollie API subscription identifier
- `mollie_customer_id` - Mollie API customer identifier
- `created_at` - Subscription creation timestamp
- `updated_at` - Last modification timestamp (auto-updated by trigger)

**Relationships:**
- `company_id` → `companies.id` (1:1, cascade delete)
- `plan_id` → `plans.id` (N:1, restrict delete to preserve history)

**Constraints:**
- One subscription per company (unique constraint on company_id)
- Unique Mollie subscription ID

**RLS Policies:**
```sql
-- Users can view their company's subscription
create policy "Users can view their company subscription"
  on subscriptions for select
  using (
    company_id = public.current_user_company_id()
  );

-- Owners can manage subscriptions
create policy "Owners can manage subscriptions"
  on subscriptions for all
  using (is_company_owner(company_id))
  with check (is_company_owner(company_id));
```

---

## Database Functions

### `is_company_owner(target_company_id)`

Helper used by RLS policies to check owner-only permissions.

```sql
create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and role = 'owner'
  );
$$;
```

---

### `handle_new_user()`

Automatically creates company and profile when a new user signs up via Supabase Auth.

```sql
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_company_id uuid;
  invited_company_id uuid;
  trial_end_date timestamptz;
begin
  if nullif(new.raw_user_meta_data->>'invited_company_id', '') is not null then
    invited_company_id := (new.raw_user_meta_data->>'invited_company_id')::uuid;

    if not exists (select 1 from public.companies c where c.id = invited_company_id) then
      raise exception 'Invalid invited_company_id % for user %', invited_company_id, new.id;
    end if;

    insert into public.profiles (id, company_id, email, full_name, role, created_at, updated_at)
    values (
      new.id,
      invited_company_id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      'member',
      now(),
      now()
    );

    return new;
  end if;

  trial_end_date := now() + interval '14 days';

  insert into public.companies (name, status, trial_ends_at, created_at, updated_at)
  values (
    coalesce(
      nullif(new.raw_user_meta_data->>'company_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    'trial',
    trial_end_date,
    now(),
    now()
  )
  returning id into new_company_id;

  insert into public.profiles (id, company_id, email, full_name, role, created_at, updated_at)
  values (
    new.id,
    new_company_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'owner',
    now(),
    now()
  );

  return new;
end;
$$ language plpgsql security definer;
```

**Trigger:**
```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**What it does:**
1. User signs up via Supabase Auth → `auth.users` row created
2. Trigger fires → calls `handle_new_user()`
3. If signup contains `invited_company_id`, validates the target company exists and creates profile as `member`
4. Otherwise creates company with:
   - Name fallback: `company_name` → `full_name` → email local-part
   - Status: 'trial'
   - Trial ends: 14 days from now
5. Creates owner profile for newly created company
   - User ID from auth.users
   - Company ID from newly created company
   - Email from auth.users
   - Role: 'owner'
6. User is now ready to use Summit

---

### `accept_invitation(invite_token, user_email)`

Accepts a pending invitation in an idempotent way.

```sql
create or replace function public.accept_invitation(invite_token text, user_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
-- 1) Hash token and load matching invitation row by token + email
-- 2) Return 'already_accepted' if status already accepted
-- 3) Return 'invalid' for missing, expired, revoked, or mismatched email
-- 4) Upsert profile to invited company as member
-- 5) Mark invitation accepted and return 'accepted'
$$;
```

**Return values:**
- `accepted`
- `already_accepted`
- `invalid`

---

### `update_updated_at_column()`

Automatically updates `updated_at` timestamp on row modifications.

```sql
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

**Triggers:**
```sql
-- For profiles table
create trigger update_profiles_updated_at 
  before update on profiles
  for each row execute procedure update_updated_at_column();

-- For companies table
create trigger update_workspaces_updated_at -- legacy trigger name on companies table
  before update on companies
  for each row execute procedure update_updated_at_column();

-- For invitations table
create trigger update_invitations_updated_at
  before update on invitations
  for each row execute procedure update_updated_at_column();

-- For subscriptions table
create trigger update_subscriptions_updated_at 
  before update on subscriptions
  for each row execute procedure update_updated_at_column();
```

---

## Row Level Security (RLS) Summary

**All tables have RLS enabled.** Security is enforced at the database level, not in application code.

### Security Model

**Principle:** Company isolation
- Users can ONLY see/modify data in their own company
- Company ID is the isolation boundary
- `auth.uid()` identifies the current user
- Policies check: "Does this user belong to the company of this data?"

### Policy Patterns

**Read (SELECT):**
```sql
-- Check if user's company matches data's company
using (
  company_id = public.current_user_company_id()
)
```

**Write (INSERT/UPDATE/DELETE):**
```sql
-- For owner-only operations
using (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and company_id = [target_company_id]
    and role = 'owner'
  )
)
```

### Public Access

**Only `plans` table** allows unauthenticated access (needed for pricing page).

All other tables require authentication.

---

## Future Tables (Not Yet Implemented)

These will be added in Sprint 1+ for the core invoicing functionality:

### `clients`
- Client contact information
- Linked to company
- RLS: company isolation

### `projects`
- Fixed-bid projects with milestones
- Linked to company and client
- Status: draft, active, completed, canceled
- RLS: company isolation

### `milestones`
- Project deliverables with payment amounts
- Linked to project
- Status: pending, completed, invoiced
- RLS: via project → company chain

### `invoices`
- Generated invoices
- Linked to company, client, project
- Status: draft, issued, paid, void
- RLS: company isolation

### `payments`
- Payment records against invoices
- Linked to invoice
- RLS: via invoice → company chain

---

## Database Maintenance

### Backups
- Automatic daily backups by Supabase
- 7-day retention on free tier
- Manual backups before schema changes

### Migrations
- Use Supabase Migration system
- Track all schema changes in version control
- Test migrations in development before production

### Monitoring
- Enable Supabase Database Observability
- Monitor query performance
- Watch for RLS policy violations (should never happen if policies correct)

---

## Common Queries

### Get current user's company
```sql
select c.* 
from companies c
join profiles p on p.company_id = c.id
where p.id = auth.uid();
```

### Get all members in user's company
```sql
select p.*
from profiles p
where p.company_id = (
  public.current_user_company_id()
);
```

### Check if user is owner
```sql
select 
  case 
    when role = 'owner' then true 
    else false 
  end as is_owner
from profiles
where id = auth.uid();
```

### Get company subscription status
```sql
select 
  c.status as company_status,
  s.status as subscription_status,
  c.trial_ends_at,
  s.current_period_end
from companies c
left join subscriptions s on s.company_id = c.id
join profiles p on p.company_id = c.id
where p.id = auth.uid();
```

---

## Schema Diagram

```
auth.users (Supabase Auth)
    |
    | (1:1)
    |
profiles -----> companies
    |               |
    | (role:)       | (1:1)
    | owner/member  |
    |           subscriptions
    |               |
    |               | (N:1)
    |               |
    +-----------> plans
    |
    +-----------> invitations
```

**Key relationships:**
- One auth.user → One profile → One company
- One company → One subscription (optional)
- One subscription → One plan
- Multiple profiles → One company (owner invites members)
- Multiple invitations → One company

---

## Notes for Development

### When Adding New Tables

1. **Enable RLS:**
   ```sql
   alter table your_table enable row level security;
   ```

2. **Add company_id:**
   ```sql
   company_id uuid references companies on delete cascade not null
   ```

3. **Create RLS policies** for company isolation

4. **Add updated_at trigger** if needed

5. **Update TypeScript types:**
   ```bash
   npx supabase gen types typescript --project-id [id] > types/database.ts
   ```

### Testing RLS Policies

Use Supabase SQL Editor with different auth contexts:
```sql
-- Test as specific user
set request.jwt.claim.sub = '[user-id]';

-- Test query
select * from companies;

-- Reset
reset request.jwt.claim.sub;
```

---

**This document should be kept in sync with actual database schema.**
