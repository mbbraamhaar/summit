create table public.subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid not null references public.plans(id) on delete restrict,
  mollie_payment_id text not null unique,
  sequence_type text not null check (sequence_type = any (array['first'::text, 'recurring'::text])),
  status text not null,
  amount numeric(10,2) not null,
  currency text not null default 'EUR'::text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscription_payment_attempts_company_created_at
  on public.subscription_payment_attempts (company_id, created_at desc);

alter table public.subscription_payment_attempts enable row level security;

create policy "Users can view company subscription payment attempts"
on public.subscription_payment_attempts
as permissive
for select
to public
using (company_id = current_user_company_id());

create policy "Owners can insert subscription payment attempts"
on public.subscription_payment_attempts
as permissive
for insert
to public
with check (is_company_owner(company_id));

create policy "Owners can update subscription payment attempts"
on public.subscription_payment_attempts
as permissive
for update
to public
using (is_company_owner(company_id))
with check (is_company_owner(company_id));

create trigger update_subscription_payment_attempts_updated_at
before update on public.subscription_payment_attempts
for each row execute function public.update_updated_at_column();
