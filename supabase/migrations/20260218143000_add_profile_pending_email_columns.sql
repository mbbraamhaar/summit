alter table public.profiles
  add column if not exists pending_email text,
  add column if not exists pending_email_requested_at timestamptz,
  add column if not exists pending_email_verification_sent_at timestamptz;

create unique index if not exists profiles_pending_email_unique_lower
  on public.profiles (lower(pending_email))
  where pending_email is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pending_email_not_same_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_pending_email_not_same_check
      check (pending_email is null or lower(pending_email) <> lower(email));
  end if;
end
$$;
