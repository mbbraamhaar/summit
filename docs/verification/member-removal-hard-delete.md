# Member Removal Hard-Delete Verification

## Prerequisites
- Local app running with Supabase env configured, including `SUPABASE_SERVICE_ROLE_KEY`.
- Migration applied: `supabase/migrations/20260217133320_fix_member_deletion_foreign_keys.sql`.

## Test Flow
1. Create owner and company.
- Sign up as owner.
- Confirm owner lands in `/dashboard` and has a profile row.

2. Invite and accept as member.
- From owner account, invite a member email.
- Accept invitation with that member account.
- Confirm member can reach `/dashboard` and has `public.profiles.id = auth.users.id`.

3. Remove member from Settings as owner.
- In `Settings -> Members`, remove the member.
- Expected: action succeeds.

4. Verify auth user + profile deletion.
- In Supabase SQL editor, verify the profile row is gone:
```sql
select id, email from public.profiles where email = '<member-email>';
```
Expected: zero rows.

- Verify auth user is gone (service role context):
```sql
select id, email from auth.users where email = '<member-email>';
```
Expected: zero rows.

5. Verify sign-in is blocked for removed account.
- Try signing in with removed member credentials.
- Expected: sign-in fails because auth identity no longer exists.

6. Verify email can be reused.
- Sign up again using the same removed member email.
- Expected: sign-up succeeds.

7. Verify zombie-session guard.
- Simulate a stale session by logging in as member in one tab.
- Remove that member in owner tab.
- In member tab, navigate to `/dashboard`.
- Expected: middleware clears auth cookies and redirects to `/sign-in?reason=removed`.
- Expected: no broken dashboard render.

## Optional FK Sanity Check
Run:
```sql
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in ('profiles_id_fkey', 'invitations_invited_by_fkey');
```
Expected:
- `profiles_id_fkey` includes `ON DELETE CASCADE`
- `invitations_invited_by_fkey` includes `ON DELETE SET NULL`
