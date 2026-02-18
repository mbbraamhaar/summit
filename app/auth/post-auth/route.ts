import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSafeRedirectPath } from '@/lib/auth/redirect'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const fallbackRedirect = getSafeRedirectPath(requestUrl.searchParams.get('redirect'))
  const inviteToken = request.cookies.get('invite_token')?.value

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const signInUrl = new URL('/auth/sign-in', request.url)
    signInUrl.searchParams.set('redirect', fallbackRedirect)
    return NextResponse.redirect(signInUrl)
  }

  if (inviteToken) {
    return NextResponse.redirect(new URL('/invite/accept', request.url))
  }

  return NextResponse.redirect(new URL(fallbackRedirect, request.url))
}
