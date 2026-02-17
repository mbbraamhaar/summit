-- Ensure deleting auth users cascades to profiles and invitation history doesn't block profile removal.
alter table public.invitations
  drop constraint if exists invitations_invited_by_fkey;

do $$
declare
  fk_name text;
begin
  for fk_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'invitations'
      and a.attname = 'invited_by'
  loop
    execute format('alter table public.invitations drop constraint if exists %I', fk_name);
  end loop;
end $$;

alter table public.invitations
  add constraint invitations_invited_by_fkey
  foreign key (invited_by)
  references public.profiles(id)
  on delete set null;

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

do $$
declare
  fk_name text;
begin
  for fk_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'profiles'
      and a.attname = 'id'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', fk_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id)
  references auth.users(id)
  on delete cascade;
