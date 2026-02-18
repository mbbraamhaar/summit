import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingInviteContext } from '@/lib/invite/context'
import { getInviteCookieMaxAgeSeconds } from '@/lib/invite/expiry'

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
  const token = requestUrl.searchParams.get('token') || ''

  if (!token) {
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookies(invalidResponse)
    return invalidResponse
  }

  const inviteContext = await getPendingInviteContext(token)
  if (!inviteContext) {
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookies(invalidResponse)
    return invalidResponse
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const destination = user
    ? new URL('/invite/accept', request.url)
    : new URL('/auth/sign-up', request.url)

  if (!user) {
    destination.searchParams.set('redirect', '/invite/accept')
  }

  const response = NextResponse.redirect(destination)
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getInviteCookieMaxAgeSeconds(),
  }

  response.cookies.set('invite_token', token, options)
  response.cookies.set('invited_company_id', inviteContext.companyId, options)
  response.cookies.set('invite_email', inviteContext.email, options)

  return response
}
