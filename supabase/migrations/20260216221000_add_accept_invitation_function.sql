create or replace function public.accept_invitation(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_user_email text;
  invite_token_hash text;
  invite_row public.invitations%rowtype;
begin
  current_user_id := auth.uid();
  current_user_email := auth.jwt() ->> 'email';

  if current_user_id is null or current_user_email is null or invite_token is null or invite_token = '' then
    return 'invalid';
  end if;

  invite_token_hash := encode(
    extensions.digest(invite_token::text, 'sha256'::text),
    'hex'::text
  );

  select i.*
  into invite_row
  from public.invitations i
  where i.token_hash = invite_token_hash
    and lower(i.email) = lower(current_user_email)
  limit 1
  for update;

  if not found then
    return 'invalid';
  end if;

  if invite_row.status = 'accepted' then
    return 'already_accepted';
  end if;

  if invite_row.status <> 'pending' or invite_row.expires_at <= now() then
    return 'invalid';
  end if;

  insert into public.profiles (id, company_id, email, role, created_at, updated_at)
  values (
    current_user_id,
    invite_row.company_id,
    current_user_email,
    'member',
    now(),
    now()
  )
  on conflict (id) do nothing;

  update public.invitations
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = invite_row.id;

  return 'accepted';
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;
