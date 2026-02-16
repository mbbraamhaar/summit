create table "public"."companies" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null,
    "status" text not null default 'trial'::text,
    "trial_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "company_registration_id" text,
    "tax_id" text,
    "address_line1" text,
    "address_line2" text,
    "city" text,
    "postal_code" text,
    "country" text,
    "bank_account_name" text,
    "bank_account_number" text,
    "bank_bic" text
);


alter table "public"."companies" enable row level security;

create table "public"."invitations" (
    "id" uuid not null default uuid_generate_v4(),
    "company_id" uuid not null,
    "email" text not null,
    "token_hash" text not null,
    "status" text not null default 'pending'::text,
    "invited_by" uuid,
    "expires_at" timestamp with time zone not null,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."invitations" enable row level security;

create table "public"."plans" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null,
    "description" text,
    "price" numeric(10,2) not null,
    "interval" text not null,
    "features" jsonb,
    "mollie_plan_id" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."plans" enable row level security;

create table "public"."profiles" (
    "id" uuid not null,
    "company_id" uuid not null,
    "email" text not null,
    "full_name" text,
    "avatar_url" text,
    "role" text not null default 'member'::text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."profiles" enable row level security;

create table "public"."subscriptions" (
    "id" uuid not null default uuid_generate_v4(),
    "company_id" uuid not null,
    "plan_id" uuid not null,
    "status" text not null,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean default false,
    "mollie_subscription_id" text,
    "mollie_customer_id" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."subscriptions" enable row level security;

CREATE INDEX idx_invitations_company_id ON public.invitations USING btree (company_id);

CREATE INDEX idx_invitations_email ON public.invitations USING btree (email);

CREATE INDEX idx_invitations_status_expires_at ON public.invitations USING btree (status, expires_at);

CREATE UNIQUE INDEX invitations_pending_company_email_unique ON public.invitations USING btree (company_id, lower(email)) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX invitations_pkey ON public.invitations USING btree (id);

CREATE UNIQUE INDEX invitations_token_hash_key ON public.invitations USING btree (token_hash);

CREATE UNIQUE INDEX plans_pkey ON public.plans USING btree (id);

CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX subscriptions_mollie_subscription_id_key ON public.subscriptions USING btree (mollie_subscription_id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX subscriptions_workspace_id_key ON public.subscriptions USING btree (company_id);

CREATE UNIQUE INDEX workspaces_pkey ON public.companies USING btree (id);

alter table "public"."companies" add constraint "workspaces_pkey" PRIMARY KEY using index "workspaces_pkey";

alter table "public"."invitations" add constraint "invitations_pkey" PRIMARY KEY using index "invitations_pkey";

alter table "public"."plans" add constraint "plans_pkey" PRIMARY KEY using index "plans_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."companies" add constraint "workspaces_status_check" CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text]))) not valid;

alter table "public"."companies" validate constraint "workspaces_status_check";

alter table "public"."invitations" add constraint "invitations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE not valid;

alter table "public"."invitations" validate constraint "invitations_company_id_fkey";

alter table "public"."invitations" add constraint "invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE SET NULL not valid;

alter table "public"."invitations" validate constraint "invitations_invited_by_fkey";

alter table "public"."invitations" add constraint "invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text]))) not valid;

alter table "public"."invitations" validate constraint "invitations_status_check";

alter table "public"."invitations" add constraint "invitations_token_hash_key" UNIQUE using index "invitations_token_hash_key";

alter table "public"."plans" add constraint "plans_interval_check" CHECK (("interval" = ANY (ARRAY['month'::text, 'year'::text]))) not valid;

alter table "public"."plans" validate constraint "plans_interval_check";

alter table "public"."profiles" add constraint "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_company_id_fkey";

alter table "public"."profiles" add constraint "profiles_email_key" UNIQUE using index "profiles_email_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

alter table "public"."subscriptions" add constraint "subscriptions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_company_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_mollie_subscription_id_key" UNIQUE using index "subscriptions_mollie_subscription_id_key";

alter table "public"."subscriptions" add constraint "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_plan_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'past_due'::text, 'suspended'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."subscriptions" add constraint "subscriptions_workspace_id_key" UNIQUE using index "subscriptions_workspace_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.current_user_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_company_id(user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id FROM public.profiles WHERE id = user_id LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    invite_token_hash := encode(
      extensions.digest(invite_token::text, 'sha256'::text),
      'hex'::text
    );

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
$function$
;

CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND company_id = target_company_id
      AND role = 'owner'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."companies" to "anon";

grant insert on table "public"."companies" to "anon";

grant references on table "public"."companies" to "anon";

grant select on table "public"."companies" to "anon";

grant trigger on table "public"."companies" to "anon";

grant truncate on table "public"."companies" to "anon";

grant update on table "public"."companies" to "anon";

grant delete on table "public"."companies" to "authenticated";

grant insert on table "public"."companies" to "authenticated";

grant references on table "public"."companies" to "authenticated";

grant select on table "public"."companies" to "authenticated";

grant trigger on table "public"."companies" to "authenticated";

grant truncate on table "public"."companies" to "authenticated";

grant update on table "public"."companies" to "authenticated";

grant delete on table "public"."companies" to "service_role";

grant insert on table "public"."companies" to "service_role";

grant references on table "public"."companies" to "service_role";

grant select on table "public"."companies" to "service_role";

grant trigger on table "public"."companies" to "service_role";

grant truncate on table "public"."companies" to "service_role";

grant update on table "public"."companies" to "service_role";

grant delete on table "public"."invitations" to "anon";

grant insert on table "public"."invitations" to "anon";

grant references on table "public"."invitations" to "anon";

grant select on table "public"."invitations" to "anon";

grant trigger on table "public"."invitations" to "anon";

grant truncate on table "public"."invitations" to "anon";

grant update on table "public"."invitations" to "anon";

grant delete on table "public"."invitations" to "authenticated";

grant insert on table "public"."invitations" to "authenticated";

grant references on table "public"."invitations" to "authenticated";

grant select on table "public"."invitations" to "authenticated";

grant trigger on table "public"."invitations" to "authenticated";

grant truncate on table "public"."invitations" to "authenticated";

grant update on table "public"."invitations" to "authenticated";

grant delete on table "public"."invitations" to "service_role";

grant insert on table "public"."invitations" to "service_role";

grant references on table "public"."invitations" to "service_role";

grant select on table "public"."invitations" to "service_role";

grant trigger on table "public"."invitations" to "service_role";

grant truncate on table "public"."invitations" to "service_role";

grant update on table "public"."invitations" to "service_role";

grant delete on table "public"."plans" to "anon";

grant insert on table "public"."plans" to "anon";

grant references on table "public"."plans" to "anon";

grant select on table "public"."plans" to "anon";

grant trigger on table "public"."plans" to "anon";

grant truncate on table "public"."plans" to "anon";

grant update on table "public"."plans" to "anon";

grant delete on table "public"."plans" to "authenticated";

grant insert on table "public"."plans" to "authenticated";

grant references on table "public"."plans" to "authenticated";

grant select on table "public"."plans" to "authenticated";

grant trigger on table "public"."plans" to "authenticated";

grant truncate on table "public"."plans" to "authenticated";

grant update on table "public"."plans" to "authenticated";

grant delete on table "public"."plans" to "service_role";

grant insert on table "public"."plans" to "service_role";

grant references on table "public"."plans" to "service_role";

grant select on table "public"."plans" to "service_role";

grant trigger on table "public"."plans" to "service_role";

grant truncate on table "public"."plans" to "service_role";

grant update on table "public"."plans" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

create policy "Owners can update company"
on "public"."companies"
as permissive
for update
to public
using (is_company_owner(id));


create policy "Users can view their company"
on "public"."companies"
as permissive
for select
to public
using ((id = current_user_company_id()));


create policy "Owners can create invitations"
on "public"."invitations"
as permissive
for insert
to public
with check ((is_company_owner(company_id) AND (status = 'pending'::text)));


create policy "Owners can update invitations"
on "public"."invitations"
as permissive
for update
to public
using (is_company_owner(company_id))
with check (is_company_owner(company_id));


create policy "Owners can view company invitations"
on "public"."invitations"
as permissive
for select
to public
using (is_company_owner(company_id));


create policy "Active plans are viewable by everyone"
on "public"."plans"
as permissive
for select
to public
using ((is_active = true));


create policy "Owners can delete members"
on "public"."profiles"
as permissive
for delete
to public
using ((is_company_owner(company_id) AND (id <> auth.uid())));


create policy "Owners can insert new members"
on "public"."profiles"
as permissive
for insert
to public
with check (is_company_owner(company_id));


create policy "Users can update own profile"
on "public"."profiles"
as permissive
for update
to public
using ((auth.uid() = id))
with check ((auth.uid() = id));


create policy "Users can view profiles in their company"
on "public"."profiles"
as permissive
for select
to public
using ((company_id = current_user_company_id()));


create policy "Owners can manage subscriptions"
on "public"."subscriptions"
as permissive
for all
to public
using (is_company_owner(company_id))
with check (is_company_owner(company_id));


create policy "Users can view their company subscription"
on "public"."subscriptions"
as permissive
for select
to public
using ((company_id = current_user_company_id()));


CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


