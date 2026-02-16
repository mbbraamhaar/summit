import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Get current user from session
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// Get current user's profile (includes company info)
export async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { profile: null, error: null }
  }
  
  // Try using the proper Supabase join syntax
  // The foreign key is company_id in profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      *,
      companies (*)
    `)
    .eq('id', user.id)
    .single()
  
  if (profileError) {
    return { profile: null, error: profileError }
  }
  
  if (!profile) {
    return { profile: null, error: null }
  }
  
  // Normalize the company data - Supabase returns it as 'companies' (plural)
  // because that's the table name
  const normalizedProfile = {
    ...profile,
    company: (profile as any).companies || null
  }
  
  return { profile: normalizedProfile as any, error: null }
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

// Check if user can access company features (not suspended/canceled)
export async function canAccessCompany() {
  const { profile } = await getCurrentProfile()
  if (!profile?.company) return false
  
  const status = (profile as any).company.status
  return status === 'trial' || status === 'active'
}
