import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Get current user from session
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// Get current user's profile (includes workspace info)
export async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { profile: null, error: null }
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      *,
      workspace:workspaces(*)
    `)
    .eq('id', user.id)
    .single()
  
  return { profile, error }
}

// Require authentication (redirect if not logged in)
export async function requireAuth() {
  const { user } = await getCurrentUser()
  if (!user) {
    redirect('/sign-in')
  }
  return user
}

// Require owner role
export async function requireOwner() {
  const { profile } = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }
  if (profile.role !== 'owner') {
    redirect('/dashboard') // Not authorized
  }
  return profile
}

// Check if user can access workspace features (not suspended/canceled)
export async function canAccessWorkspace() {
  const { profile } = await getCurrentProfile()
  if (!profile?.workspace) return false
  
  const status = profile.workspace.status
  return status === 'trial' || status === 'active'
}
