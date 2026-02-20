alter table public.subscriptions
drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
add constraint subscriptions_status_check
check (
  status = any (
    array[
      'pending'::text,
      'active'::text,
      'canceled'::text,
      'past_due'::text,
      'suspended'::text
    ]
  )
) not valid;

alter table public.subscriptions
validate constraint subscriptions_status_check;
