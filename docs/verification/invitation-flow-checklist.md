# Invitation Flow Manual Checklist

## Preconditions
- You have an owner account that can send invitations.
- You can test with one brand-new email and one existing member email.
- Start each scenario in a fresh private/incognito window unless the scenario explicitly tests stale cookies.

## 1) New invited user -> sign-up -> accepted -> dashboard
1. Owner invites a brand-new email.
2. Open the invite link while signed out.
3. Confirm you are redirected to `/auth/sign-up` (or `/sign-up` via alias), not sign-in.
4. Complete sign-up with the invited email.
5. After auth, confirm redirect goes to `/invite/accept` and then to `/dashboard`.
6. Confirm membership is active in Settings > Members.

## 2) Existing user -> sign-in -> accepted -> dashboard
1. Owner invites an email that already has an account.
2. Open the invite link while signed out.
3. Confirm you land on sign-up by default, then use the "Already have an account? Sign in" path.
4. Sign in with the invited existing account.
5. Confirm redirect goes to `/invite/accept` and then to `/dashboard`.
6. Confirm membership is active in Settings > Members.

## 3) Stale cookie + new token link accepts the new token
1. First open invite link A so `invite_token` cookie is set.
2. Without clearing cookies, open invite link B (different token).
3. Complete auth if required.
4. Confirm acceptance applies to invite B (latest link), not invite A.
5. Confirm final redirect is `/dashboard`.

## 4) Invalid token clears cookie and lands on `/invite/invalid`
1. Open `/invite/accept?token=<invalid-or-revoked-token>` while signed out.
2. Complete auth if prompted.
3. Confirm you land on `/invite/invalid` with deterministic error text.
4. Confirm `invite_token` cookie is cleared.
5. Visit `/invite/accept` again and confirm it still routes to `/invite/invalid` (no stale token retained).
