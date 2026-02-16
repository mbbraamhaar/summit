import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const token = requestUrl.searchParams.get('token') || ''

  if (!token) {
    return NextResponse.redirect(new URL('/invite/invalid', request.url))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const destination = user
    ? new URL(`/invite/accept?token=${encodeURIComponent(token)}`, request.url)
    : new URL('/auth/sign-in', request.url)

  const response = NextResponse.redirect(destination)
  response.cookies.set('invite_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return response
}
