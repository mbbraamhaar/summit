# Email Change Flow Manual Checklist

## Preconditions
- Supabase Auth setting for email change is configured for your intended UX.
- Use a test user with access to `/profile`.
- Use two inboxes you control (current email + new email).
- Start each scenario in a fresh browser session unless the scenario says otherwise.

## 1) Request email change enters pending state
1. Sign in and open `/profile`.
2. Enter a different email in `New email` and submit `Send verification`.
3. Confirm success toast appears.
4. Confirm pending banner appears with the target email.
5. Confirm current login email in UI is unchanged.

## 2) New-email verification completes change
1. From the pending state, open the verification link sent to the NEW email.
2. Confirm redirect lands on `/profile?email_change=success`.
3. Confirm pending banner is gone.
4. Confirm `Current email` now shows the new email address.
5. Sign out and sign in again with the new email.

## 3) Resend verification keeps pending state
1. While pending, click `Resend verification email`.
2. Confirm resend success toast appears.
3. Confirm pending banner remains.
4. Confirm latest link from NEW email still completes with `email_change=success`.

## 4) Cancel pending change invalidates old links
1. While pending, click `Cancel pending change`.
2. Confirm cancel success toast appears.
3. Confirm pending banner disappears and new-email input resets.
4. Open an old verification link from the canceled request.
5. Confirm app does NOT switch the account email.
6. Confirm callback state is deterministic (`email_change=invalid` or `email_change=pending`) without applying the canceled change.

## 5) Invalid or expired verification link
1. Open a tampered/expired email-change link.
2. Confirm redirect is deterministic and no email is changed.
3. Confirm pending state remains if there is still an active pending request.

## 6) Logged-out link click
1. Sign out while a pending request exists.
2. Open the verification link.
3. Confirm the flow asks for sign-in when session is required.
4. After sign-in, confirm completion reaches `/profile` with a deterministic status and no inconsistent state.

## 7) Wrong-account protection
1. Create pending email change for User A.
2. Sign in as User B and open User A verification link.
3. Confirm User B email is not changed.
4. Confirm User A pending state is not incorrectly applied to User B.
