import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SessionProfile = {
  id: string
  role: string
  company_id: string
  email: string
  company: { name: string } | null
}

export async function getProfileOrRedirect() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      id,
      role,
      company_id,
      email,
      company:companies(name)
    `)
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/sign-in?reason=removed')
  }

  return {
    supabase,
    user,
    profile: profile as SessionProfile,
  }
}
