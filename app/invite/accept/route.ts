import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingInviteContext } from '@/lib/invite/context'
import { getInviteCookieMaxAgeSeconds } from '@/lib/invite/expiry'

function setInviteCookies(response: NextResponse, invite: { token: string; companyId: string; email: string }) {
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getInviteCookieMaxAgeSeconds(),
  }

  response.cookies.set('invite_token', invite.token, options)
  response.cookies.set('invited_company_id', invite.companyId, options)
  response.cookies.set('invite_email', invite.email, options)
}

function clearInviteCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  }

  response.cookies.set('invite_token', '', options)
  response.cookies.set('invited_company_id', '', options)
  response.cookies.set('invite_email', '', options)
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenFromQuery = requestUrl.searchParams.get('token')
  const tokenFromCookie = request.cookies.get('invite_token')?.value
  const token = tokenFromQuery ?? tokenFromCookie ?? ''

  if (!token) {
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookies(invalidResponse)
    return invalidResponse
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const inviteContext = await getPendingInviteContext(token)
    if (!inviteContext) {
      const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
      clearInviteCookies(invalidResponse)
      return invalidResponse
    }

    const signUpUrl = new URL('/auth/sign-up', request.url)
    signUpUrl.searchParams.set('redirect', '/invite/accept')
    const redirectResponse = NextResponse.redirect(signUpUrl)
    setInviteCookies(redirectResponse, {
      token,
      companyId: inviteContext.companyId,
      email: inviteContext.email,
    })
    return redirectResponse
  }

  const { data, error } = await supabase.rpc('accept_invitation', {
    invite_token: token,
    user_email: user.email ?? '',
  })

  if (error) {
    console.error('accept_invitation RPC failed:', error)
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookies(invalidResponse)
    return invalidResponse
  }

  if (data === 'accepted' || data === 'already_accepted') {
    const successResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    clearInviteCookies(successResponse)
    return successResponse
  }

  const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
  clearInviteCookies(invalidResponse)
  return invalidResponse
}
