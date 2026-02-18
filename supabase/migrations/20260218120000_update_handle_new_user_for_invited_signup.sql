create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  invited_company_id uuid;
  trial_end_date timestamptz;
begin
  -- INVITED SIGNUP PATH: attach to existing company as member
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

  -- DEFAULT SIGNUP PATH: create company + owner profile + 14-day trial
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
$$;
