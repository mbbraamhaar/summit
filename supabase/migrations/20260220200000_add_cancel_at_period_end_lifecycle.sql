create or replace function public.apply_recurring_payment(
  p_subscription_id uuid,
  p_company_id uuid,
  p_payment_id text,
  p_payment_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_current_period_end timestamptz;
  v_past_due_since timestamptz;
  v_attempt_id uuid;
  v_attempt_processed_at timestamptz;
  v_attempt_subscription_id uuid;
  v_attempt_company_id uuid;
begin
  select
    status,
    current_period_end,
    past_due_since
  into
    v_status,
    v_current_period_end,
    v_past_due_since
  from public.subscriptions
  where id = p_subscription_id
    and company_id = p_company_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select
    id,
    processed_at,
    subscription_id,
    company_id
  into
    v_attempt_id,
    v_attempt_processed_at,
    v_attempt_subscription_id,
    v_attempt_company_id
  from public.subscription_payment_attempts
  where mollie_payment_id = p_payment_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_attempt_processed_at is not null then
    return 'already_processed';
  end if;

  if v_attempt_subscription_id is distinct from p_subscription_id then
    return 'not_found';
  end if;

  if v_attempt_company_id is distinct from p_company_id then
    return 'not_found';
  end if;

  if v_status = 'canceled' then
    update public.subscription_payment_attempts
    set processed_at = p_now
    where id = v_attempt_id;

    return 'already_processed';
  end if;

  if p_payment_status = 'paid' then
    if v_current_period_end is null then
      return 'not_found';
    end if;

    update public.subscriptions
    set
      current_period_start = v_current_period_end,
      current_period_end = p_period_end,
      status = 'active',
      past_due_since = null,
      suspended_at = null
    where id = p_subscription_id
      and company_id = p_company_id;

    update public.companies
    set status = 'active'
    where id = p_company_id;

    update public.subscription_payment_attempts
    set processed_at = p_now
    where id = v_attempt_id;

    if v_status = 'past_due' or v_status = 'suspended' then
      return 'recovered';
    end if;

    return 'extended';
  end if;

  if p_payment_status = any (array['failed'::text, 'expired'::text, 'canceled'::text]) then
    if v_status = 'suspended' then
      update public.subscription_payment_attempts
      set processed_at = p_now
      where id = v_attempt_id;

      return 'suspended';
    end if;

    if v_status <> 'past_due' then
      update public.subscriptions
      set
        status = 'past_due',
        past_due_since = p_now
      where id = p_subscription_id
        and company_id = p_company_id;

      update public.subscription_payment_attempts
      set processed_at = p_now
      where id = v_attempt_id;

      return 'past_due_set';
    end if;

    if v_past_due_since is not null and v_past_due_since + interval '7 days' <= p_now then
      update public.subscriptions
      set
        status = 'suspended',
        suspended_at = p_now
      where id = p_subscription_id
        and company_id = p_company_id;

      update public.companies
      set status = 'suspended'
      where id = p_company_id;

      update public.subscription_payment_attempts
      set processed_at = p_now
      where id = v_attempt_id;

      return 'suspended';
    end if;

    update public.subscription_payment_attempts
    set processed_at = p_now
    where id = v_attempt_id;

    return 'past_due_set';
  end if;

  return 'not_found';
end;
$$;

create or replace function public.evaluate_subscription_period_expiry(
  p_subscription_id uuid,
  p_company_id uuid,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_cancel_at_period_end boolean;
  v_current_period_end timestamptz;
begin
  select
    status,
    cancel_at_period_end,
    current_period_end
  into
    v_status,
    v_cancel_at_period_end,
    v_current_period_end
  from public.subscriptions
  where id = p_subscription_id
    and company_id = p_company_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_cancel_at_period_end is true
    and v_status = 'active'
    and v_current_period_end is not null
    and v_current_period_end <= p_now then
    update public.subscriptions
    set status = 'canceled'
    where id = p_subscription_id
      and company_id = p_company_id;

    update public.companies
    set status = 'canceled'
    where id = p_company_id;

    return 'canceled';
  end if;

  return 'no_change';
end;
$$;

grant execute on function public.apply_recurring_payment(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

grant execute on function public.evaluate_subscription_period_expiry(
  uuid,
  uuid,
  timestamptz
) to authenticated, service_role;
