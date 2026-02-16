import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsTabs } from '@/components/settings/settings-tabs'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
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
      *,
      company:companies(*)
    `)
    .eq('id', user.id)
    .single()

  if (profileError || !profile || !profile.company) {
    redirect('/dashboard')
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:plans(*)
    `)
    .eq('company_id', profile.company_id)
    .single()

  const { data: members } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })

  const { data: pendingInvitations } = await supabase
    .from('invitations')
    .select('id, email, status, expires_at, created_at')
    .eq('company_id', profile.company_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const params = await searchParams
  const activeTab = (params.tab as string) || 'company'

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your company settings, subscription, and team members
        </p>
      </div>

      <SettingsTabs
        activeTab={activeTab}
        company={profile.company}
        userRole={profile.role}
        subscription={subscription}
        members={members || []}
        pendingInvitations={pendingInvitations || []}
        currentUserId={user.id}
      />
    </div>
  )
}
