import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompanyForm } from '@/components/settings/company-form'
import { SubscriptionTab } from '@/components/settings/subscription-tab'
import { MembersTab } from '@/components/settings/members-tab'

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

      <Tabs value={activeTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="company" asChild>
            <a href="/settings?tab=company">Company</a>
          </TabsTrigger>
          <TabsTrigger value="subscription" asChild>
            <a href="/settings?tab=subscription">Subscription</a>
          </TabsTrigger>
          <TabsTrigger value="members" asChild>
            <a href="/settings?tab=members">Members</a>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <CompanyForm company={profile.company} userRole={profile.role} />
        </TabsContent>

        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionTab subscription={subscription} userRole={profile.role} />
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <MembersTab
            members={members || []}
            pendingInvitations={pendingInvitations || []}
            currentUserId={user.id}
            userRole={profile.role}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
