-- Avatar storage bucket + policies (Sprint 0)
-- Run this script in the Supabase SQL Editor.

-- 1) Create public bucket for avatars (idempotent)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

-- 2) Replace policies for this bucket (idempotent)
drop policy if exists "Avatar objects are readable by owner" on storage.objects;
drop policy if exists "Avatar objects are insertable by owner" on storage.objects;
drop policy if exists "Avatar objects are updatable by owner" on storage.objects;

-- Object name format: {uid}/avatar.{ext}
create policy "Avatar objects are readable by owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatar objects are insertable by owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatar objects are updatable by owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
