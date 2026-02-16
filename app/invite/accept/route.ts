import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function clearInviteCookie(response: NextResponse) {
  response.cookies.set('invite_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenFromQuery = requestUrl.searchParams.get('token')
  const tokenFromCookie = request.cookies.get('invite_token')?.value
  const token = tokenFromQuery || tokenFromCookie || ''

  if (!token) {
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookie(invalidResponse)
    return invalidResponse
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const signInUrl = new URL('/auth/sign-in', request.url)
    signInUrl.searchParams.set('redirect', `/invite/accept?token=${encodeURIComponent(token)}`)
    return NextResponse.redirect(signInUrl)
  }

  const { data, error } = await supabase.rpc('accept_invitation', {
    invite_token: token,
    user_email: user.email ?? '',
  })

  if (error) {
    console.error('accept_invitation RPC failed:', error)
    const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
    clearInviteCookie(invalidResponse)
    return invalidResponse
  }

  if (data === 'accepted' || data === 'already_accepted') {
    const successResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    clearInviteCookie(successResponse)
    return successResponse
  }

  const invalidResponse = NextResponse.redirect(new URL('/invite/invalid', request.url))
  clearInviteCookie(invalidResponse)
  return invalidResponse
}
