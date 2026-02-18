import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSafeRedirectPath } from '@/lib/auth/redirect'

type EmailChangeStatus = 'success' | 'pending' | 'invalid'
type VerifyType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'

function appendEmailChangeStatus(path: string, status: EmailChangeStatus) {
  const url = new URL(path, 'http://localhost')
  url.searchParams.set('email_change', status)
  return `${url.pathname}${url.search}`
}

function normalizeVerifyType(rawType: string | null): VerifyType | null {
  if (!rawType) {
    return null
  }

  if (
    rawType === 'signup' ||
    rawType === 'invite' ||
    rawType === 'magiclink' ||
    rawType === 'recovery' ||
    rawType === 'email_change' ||
    rawType === 'email'
  ) {
    return rawType
  }

  if (rawType === 'email_change_current' || rawType === 'email_change_new') {
    return 'email_change'
  }

  return null
}

async function syncEmailChangeState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  authEmail: string
): Promise<EmailChangeStatus> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, pending_email')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    return 'invalid'
  }

  const profileEmail = profile.email.trim().toLowerCase()
  const pendingEmail = profile.pending_email?.trim().toLowerCase() ?? null

  if (pendingEmail && authEmail === pendingEmail) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email: authEmail,
        pending_email: null,
        pending_email_requested_at: null,
        pending_email_verification_sent_at: null,
      })
      .eq('id', userId)

    return updateError ? 'invalid' : 'success'
  }

  if (pendingEmail && authEmail !== pendingEmail) {
    return 'pending'
  }

  if (!pendingEmail && authEmail !== profileEmail) {
    const admin = createAdminClient()
    const { error: revertError } = await admin.auth.admin.updateUserById(userId, {
      email: profileEmail,
      email_confirm: true,
    })

    return revertError ? 'invalid' : 'invalid'
  }

  return 'success'
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash') || requestUrl.searchParams.get('token')
  const verifyType = normalizeVerifyType(requestUrl.searchParams.get('type'))
  const redirectPath = getSafeRedirectPath(requestUrl.searchParams.get('redirect'), '/profile')
  const supabase = await createClient()

  if (!code && (!tokenHash || !verifyType)) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const signInUrl = new URL('/auth/sign-in', request.url)
      signInUrl.searchParams.set('reason', 'email_change')
      signInUrl.searchParams.set('redirect', appendEmailChangeStatus(redirectPath, 'pending'))
      return NextResponse.redirect(signInUrl)
    }

    const authEmail = user.email?.trim().toLowerCase() ?? ''
    const status = authEmail
      ? await syncEmailChangeState(supabase, user.id, authEmail)
      : 'pending'

    return NextResponse.redirect(
      new URL(appendEmailChangeStatus(redirectPath, status), request.url)
    )
  }

  const authError = code
    ? (await supabase.auth.exchangeCodeForSession(code)).error
    : (await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: verifyType! })).error

  if (authError) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const signInUrl = new URL('/auth/sign-in', request.url)
      signInUrl.searchParams.set('reason', 'email_change')
      signInUrl.searchParams.set('redirect', appendEmailChangeStatus(redirectPath, 'pending'))
      return NextResponse.redirect(signInUrl)
    }

    const authEmail = user.email?.trim().toLowerCase() ?? ''
    const status = authEmail
      ? await syncEmailChangeState(supabase, user.id, authEmail)
      : 'pending'

    return NextResponse.redirect(
      new URL(appendEmailChangeStatus(redirectPath, status), request.url)
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const signInUrl = new URL('/auth/sign-in', request.url)
    signInUrl.searchParams.set('reason', 'email_change')
    signInUrl.searchParams.set('redirect', appendEmailChangeStatus(redirectPath, 'pending'))
    return NextResponse.redirect(signInUrl)
  }

  const authEmail = user.email?.trim().toLowerCase() ?? ''
  const status = authEmail
    ? await syncEmailChangeState(supabase, user.id, authEmail)
    : 'pending'

  return NextResponse.redirect(
    new URL(appendEmailChangeStatus(redirectPath, status), request.url)
  )
}
