import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const KNOWN_SUPABASE_COOKIE_NAMES = [
  'supabase-auth-token',
  'sb-access-token',
  'sb-refresh-token',
]

const GUARDED_PATH_PREFIXES = [
  '/dashboard',
  '/settings',
  '/profile',
  '/clients',
  '/projects',
  '/invoices',
]

function isGuardedPath(pathname: string) {
  return GUARDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function isDomainCookieHost(hostname: string) {
  if (hostname === 'localhost') {
    return false
  }

  return hostname.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)
}

function extractProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    return null
  }

  try {
    const hostname = new URL(url).hostname
    return hostname.split('.')[0] || null
  } catch {
    return null
  }
}

function getKnownProjectCookieNames() {
  const projectRef = extractProjectRef()
  if (!projectRef) {
    return []
  }

  const base = `sb-${projectRef}-auth-token`
  return [base, `${base}.0`, `${base}.1`]
}

function clearSupabaseAuthCookies(response: NextResponse, request: NextRequest) {
  const cookieNames = new Set<string>([
    ...KNOWN_SUPABASE_COOKIE_NAMES,
    ...getKnownProjectCookieNames(),
  ])

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      cookieNames.add(cookie.name)
    }
  }

  const domainHost = request.nextUrl.hostname
  const shouldSetDomain = isDomainCookieHost(domainHost)
  const parentDomain =
    shouldSetDomain && domainHost.startsWith('www.')
      ? domainHost.slice('www.'.length)
      : null

  for (const cookieName of cookieNames) {
    response.cookies.set({
      name: cookieName,
      value: '',
      path: '/',
      maxAge: 0,
    })

    if (shouldSetDomain) {
      response.cookies.set({
        name: cookieName,
        value: '',
        path: '/',
        domain: domainHost,
        maxAge: 0,
      })
    }

    if (parentDomain) {
      response.cookies.set({
        name: cookieName,
        value: '',
        path: '/',
        domain: parentDomain,
        maxAge: 0,
      })
    }
  }
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user && isGuardedPath(request.nextUrl.pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      await supabase.auth.signOut()
      const signInUrl = new URL('/sign-in', request.url)
      signInUrl.searchParams.set('reason', 'removed')
      const redirectResponse = NextResponse.redirect(signInUrl)
      clearSupabaseAuthCookies(redirectResponse, request)

      return redirectResponse
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
