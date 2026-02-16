-- Member invitations schema + invite-aware signup flow
-- Run this script in Supabase SQL Editor.

-- Required for digest() hashing
create extension if not exists pgcrypto;

-- Store invitation tokens hashed at rest
create table if not exists public.invitations (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_invitations_company_id on public.invitations(company_id);
create index if not exists idx_invitations_email on public.invitations(email);
create index if not exists idx_invitations_status_expires_at on public.invitations(status, expires_at);

-- Prevent duplicate pending invitation for same email in same company
create unique index if not exists invitations_pending_company_email_unique
  on public.invitations(company_id, lower(email))
  where status = 'pending';

drop trigger if exists update_invitations_updated_at on public.invitations;
create trigger update_invitations_updated_at
  before update on public.invitations
  for each row execute procedure public.update_updated_at_column();

alter table public.invitations enable row level security;

drop policy if exists "Owners can view company invitations" on public.invitations;
drop policy if exists "Owners can create invitations" on public.invitations;
drop policy if exists "Owners can update invitations" on public.invitations;

create policy "Owners can view company invitations"
  on public.invitations
  for select
  using (public.is_company_owner(company_id));

create policy "Owners can create invitations"
  on public.invitations
  for insert
  with check (
    public.is_company_owner(company_id)
    and status = 'pending'
  );

create policy "Owners can update invitations"
  on public.invitations
  for update
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

-- Invite-aware signup:
-- If a valid pending invitation token exists in user metadata:
-- - profile is created as member in inviter company
-- - invitation status becomes accepted
-- Else fallback to default: create company + owner profile.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_company_id uuid;
  trial_end_date timestamptz;
  invite_token text;
  invite_token_hash text;
  invited_company_id uuid;
  invitation_id uuid;
begin
  invite_token := nullif(new.raw_user_meta_data->>'invite_token', '');

  if invite_token is not null then
    invite_token_hash := encode(digest(invite_token, 'sha256'), 'hex');

    select i.id, i.company_id
      into invitation_id, invited_company_id
    from public.invitations i
    where i.token_hash = invite_token_hash
      and i.status = 'pending'
      and lower(i.email) = lower(new.email)
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
    for update;

    if invitation_id is not null then
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

      update public.invitations
      set status = 'accepted',
          accepted_at = now(),
          updated_at = now()
      where id = invitation_id;

      return new;
    end if;

    raise exception 'Invalid, expired, or already used invitation token';
  end if;

  -- Default signup flow (new company + owner)
  trial_end_date := now() + interval '14 days';

  insert into public.companies (name, status, trial_ends_at, created_at, updated_at)
  values (
    coalesce(
      new.raw_user_meta_data->>'company_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ) || '''s Company',
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
