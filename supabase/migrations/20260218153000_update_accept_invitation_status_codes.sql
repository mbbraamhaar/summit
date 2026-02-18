create or replace function public.accept_invitation(invite_token text, user_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  invite_token_hash text;
  invite_row public.invitations%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null or user_email is null or user_email = '' or invite_token is null or invite_token = '' then
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
  limit 1
  for update;

  if not found then
    return 'invalid';
  end if;

  if lower(invite_row.email) <> lower(user_email) then
    return 'email_mismatch';
  end if;

  if invite_row.status = 'revoked' then
    return 'revoked';
  end if;

  if invite_row.status = 'accepted' then
    return 'already_accepted';
  end if;

  if invite_row.status = 'expired' then
    return 'expired';
  end if;

  if invite_row.status <> 'pending' then
    return 'invalid';
  end if;

  if invite_row.expires_at < now() then
    return 'expired';
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      revoked_at = null,
      updated_at = now()
  where id = invite_row.id
    and status = 'pending'
    and expires_at >= now();

  if not found then
    select i.*
    into invite_row
    from public.invitations i
    where i.id = invite_row.id;

    if not found then
      return 'invalid';
    end if;

    if invite_row.status = 'accepted' then
      return 'already_accepted';
    end if;

    if invite_row.status = 'revoked' then
      return 'revoked';
    end if;

    if invite_row.status = 'expired' or (invite_row.status = 'pending' and invite_row.expires_at < now()) then
      return 'expired';
    end if;

    return 'invalid';
  end if;

  insert into public.profiles (id, company_id, email, role, created_at, updated_at)
  values (
    current_user_id,
    invite_row.company_id,
    user_email,
    'member',
    now(),
    now()
  )
  on conflict (id) do update
  set company_id = excluded.company_id,
      email = excluded.email,
      role = excluded.role,
      updated_at = now();

  return 'accepted';
end;
$$;

grant execute on function public.accept_invitation(text, text) to authenticated;
