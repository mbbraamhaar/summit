create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_company_id uuid;
  trial_end_date timestamptz;
begin
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
$function$;
