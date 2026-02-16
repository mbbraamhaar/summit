import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSafeRedirectPath } from '@/lib/auth/redirect'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AuthSignInAliasPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const redirectTo = getSafeRedirectPath(
    typeof params.redirect === 'string' ? params.redirect : undefined
  )

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect(redirectTo)
  }

  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query.set(key, value)
    }
  }

  const destination = query.toString() ? `/sign-in?${query.toString()}` : '/sign-in'
  redirect(destination)
}
