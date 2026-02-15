# Summit - Database Schema Documentation

**Last Updated:** February 15, 2026  
**Database:** PostgreSQL via Supabase  
**Security:** Row Level Security (RLS) enabled on all tables

---

## Schema Overview

Summit uses a **simplified single-workspace-per-user multi-tenancy model**:
- Each user belongs to exactly ONE workspace
- Workspaces are completely isolated from each other
- Email addresses are globally unique
- RLS policies enforce workspace isolation at the database level

---

## Tables

### `workspaces`

Primary tenant table. Each workspace represents an isolated business/organization.

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
```

**Fields:**
- `id` - Unique identifier
- `name` - Display name (e.g., "John's Workspace", "Acme Design Studio")
- `slug` - URL-safe unique identifier (generated from email on signup)
- `status` - Current subscription/trial status
  - `trial` - In 14-day trial period
  - `active` - Paid and active subscription
  - `past_due` - Payment failed, grace period
  - `suspended` - Access suspended (read-only)
  - `canceled` - Subscription canceled
- `trial_ends_at` - When trial period ends (set to signup + 14 days)
- `created_at` - Workspace creation timestamp
- `updated_at` - Last modification timestamp (auto-updated by trigger)

**Indexes:**
- Primary key on `id`
- Unique constraint on `slug`

**RLS Policies:**
```sql
-- Users can view their own workspace
create policy "Users can view their workspace"
  on workspaces for select
  using (
    id = (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- Owners can update their workspace
create policy "Owners can update workspace"
  on workspaces for update
  using (
    exists (
      select 1 from profiles
      where profiles.workspace_id = workspaces.id
      and profiles.id = auth.uid()
      and profiles.role = 'owner'
    )
  );
```

---

### `profiles`

User profile information. Links users to their workspace and defines their role.

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
```

**Fields:**
- `id` - References `auth.users.id` (Supabase Auth user ID)
- `workspace_id` - The ONE workspace this user belongs to
- `email` - Email address (globally unique, enforced by unique constraint)
- `full_name` - Display name (optional)
- `avatar_url` - Profile picture URL (Supabase Storage path, optional)
- `role` - User's role within their workspace
  - `owner` - Full permissions (billing, member management, all data operations)
  - `member` - Full data permissions (no billing or member management)
- `created_at` - Profile creation timestamp
- `updated_at` - Last modification timestamp (auto-updated by trigger)

**Relationships:**
- `id` → `auth.users.id` (1:1, cascade delete)
- `workspace_id` → `workspaces.id` (N:1, cascade delete)

**Constraints:**
- Email must be unique globally (one user can't have multiple workspaces)
- Role must be 'owner' or 'member'

**Indexes:**
- Primary key on `id`
- Unique constraint on `email`
- Foreign key index on `workspace_id`

**RLS Policies:**
```sql
-- Users can view all profiles in their workspace
create policy "Users can view profiles in their workspace"
  on profiles for select
  using (
    workspace_id = (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- Users can update their own profile
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Owners can insert new members (for invitations)
create policy "Owners can insert new members"
  on profiles for insert
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role = 'owner'
      and workspace_id = profiles.workspace_id
    )
  );

-- Owners can delete members (but not themselves)
create policy "Owners can delete members"
  on profiles for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'owner'
      and p.workspace_id = profiles.workspace_id
    )
    and id != auth.uid()
  );
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

Active subscriptions. Links workspaces to their paid plans.

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
```

**Fields:**
- `id` - Unique identifier
- `workspace_id` - Workspace this subscription belongs to (ONE subscription per workspace)
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
- `workspace_id` → `workspaces.id` (1:1, cascade delete)
- `plan_id` → `plans.id` (N:1, restrict delete to preserve history)

**Constraints:**
- One subscription per workspace (unique constraint on workspace_id)
- Unique Mollie subscription ID

**RLS Policies:**
```sql
-- Users can view their workspace's subscription
create policy "Users can view their workspace subscription"
  on subscriptions for select
  using (
    workspace_id = (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- Owners can manage subscriptions
create policy "Owners can manage subscriptions"
  on subscriptions for all
  using (
    exists (
      select 1 from profiles
      where profiles.workspace_id = subscriptions.workspace_id
      and profiles.id = auth.uid()
      and profiles.role = 'owner'
    )
  );
```

---

## Database Functions

### `handle_new_user()`

Automatically creates workspace and profile when a new user signs up via Supabase Auth.

```sql
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_workspace_id uuid;
  workspace_slug text;
begin
  -- Generate a unique slug from email
  workspace_slug := split_part(new.email, '@', 1) || '-' || substring(new.id::text from 1 for 8);
  
  -- Create workspace for new user
  insert into public.workspaces (name, slug, status, trial_ends_at)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s Workspace',
    workspace_slug,
    'trial',
    timezone('utc'::text, now()) + interval '14 days'
  )
  returning id into new_workspace_id;
  
  -- Create profile linked to workspace as owner
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
3. Function generates unique workspace slug from email
4. Creates workspace with:
   - Name: "[User's name]'s Workspace" or "[email username]'s Workspace"
   - Status: 'trial'
   - Trial ends: 14 days from now
5. Creates profile with:
   - User ID from auth.users
   - Workspace ID from newly created workspace
   - Email from auth.users
   - Role: 'owner'
6. User is now ready to use Summit

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

-- For workspaces table
create trigger update_workspaces_updated_at 
  before update on workspaces
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

**Principle:** Workspace isolation
- Users can ONLY see/modify data in their own workspace
- Workspace ID is the isolation boundary
- `auth.uid()` identifies the current user
- Policies check: "Does this user belong to the workspace of this data?"

### Policy Patterns

**Read (SELECT):**
```sql
-- Check if user's workspace matches data's workspace
using (
  workspace_id = (
    select workspace_id from profiles where id = auth.uid()
  )
)
```

**Write (INSERT/UPDATE/DELETE):**
```sql
-- For owner-only operations
using (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and workspace_id = [target_workspace_id]
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
- Linked to workspace
- RLS: workspace isolation

### `projects`
- Fixed-bid projects with milestones
- Linked to workspace and client
- Status: draft, active, completed, canceled
- RLS: workspace isolation

### `milestones`
- Project deliverables with payment amounts
- Linked to project
- Status: pending, completed, invoiced
- RLS: via project → workspace chain

### `invoices`
- Generated invoices
- Linked to workspace, client, project
- Status: draft, issued, paid, void
- RLS: workspace isolation

### `payments`
- Payment records against invoices
- Linked to invoice
- RLS: via invoice → workspace chain

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

### Get current user's workspace
```sql
select w.* 
from workspaces w
join profiles p on p.workspace_id = w.id
where p.id = auth.uid();
```

### Get all members in user's workspace
```sql
select p.*
from profiles p
where p.workspace_id = (
  select workspace_id from profiles where id = auth.uid()
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

### Get workspace subscription status
```sql
select 
  w.status as workspace_status,
  s.status as subscription_status,
  w.trial_ends_at,
  s.current_period_end
from workspaces w
left join subscriptions s on s.workspace_id = w.id
join profiles p on p.workspace_id = w.id
where p.id = auth.uid();
```

---

## Schema Diagram

```
auth.users (Supabase Auth)
    |
    | (1:1)
    |
profiles -----> workspaces
    |               |
    | (role:)       | (1:1)
    | owner/member  |
    |           subscriptions
    |               |
    |               | (N:1)
    |               |
    +-----------> plans
```

**Key relationships:**
- One auth.user → One profile → One workspace
- One workspace → One subscription (optional)
- One subscription → One plan
- Multiple profiles → One workspace (owner invites members)

---

## Notes for Development

### When Adding New Tables

1. **Enable RLS:**
   ```sql
   alter table your_table enable row level security;
   ```

2. **Add workspace_id:**
   ```sql
   workspace_id uuid references workspaces on delete cascade not null
   ```

3. **Create RLS policies** for workspace isolation

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
select * from workspaces;

-- Reset
reset request.jwt.claim.sub;
```

---

**This document should be kept in sync with actual database schema.**
