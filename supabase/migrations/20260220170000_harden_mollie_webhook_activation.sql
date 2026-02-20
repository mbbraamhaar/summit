do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and contype = 'u'
      and regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g') = 'UNIQUE (company_id)'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_company_id_key unique (company_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%(mollie_subscription_id)%'
  ) then
    create unique index subscriptions_mollie_subscription_id_unique_idx
      on public.subscriptions (mollie_subscription_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.subscriptions'::regclass
      and tgname = 'update_subscriptions_updated_at'
      and not tgisinternal
  ) then
    create trigger update_subscriptions_updated_at
    before update on public.subscriptions
    for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

create or replace function public.activate_subscription_after_first_payment(
  p_subscription_id uuid,
  p_company_id uuid,
  p_mollie_subscription_id text,
  p_mollie_customer_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_mollie_subscription_id text;
  v_current_period_start timestamptz;
  v_current_period_end timestamptz;
begin
  select
    status,
    mollie_subscription_id,
    current_period_start,
    current_period_end
  into
    v_status,
    v_mollie_subscription_id,
    v_current_period_start,
    v_current_period_end
  from public.subscriptions
  where id = p_subscription_id
    and company_id = p_company_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status = 'active' then
    return 'already_active';
  end if;

  if v_mollie_subscription_id is not null and v_mollie_subscription_id <> p_mollie_subscription_id then
    return 'already_linked';
  end if;

  update public.subscriptions
  set
    status = 'active',
    current_period_start = coalesce(v_current_period_start, p_period_start),
    current_period_end = coalesce(v_current_period_end, p_period_end),
    mollie_subscription_id = coalesce(v_mollie_subscription_id, p_mollie_subscription_id),
    mollie_customer_id = coalesce(p_mollie_customer_id, mollie_customer_id),
    cancel_at_period_end = false
  where id = p_subscription_id
    and company_id = p_company_id;

  update public.companies
  set status = 'active'
  where id = p_company_id;

  return 'activated';
end;
$$;

grant execute on function public.activate_subscription_after_first_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;
