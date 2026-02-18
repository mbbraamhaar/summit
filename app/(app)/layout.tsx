import { getCurrentProfile, requireAuth } from '@/lib/auth/helpers'
import { DashboardNav } from '@/components/layout/dashboard-nav'
import { createClient } from '@/lib/supabase/server'
import { getCompanyEntitlement } from '@/lib/subscriptions/helpers'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const { profile } = await getCurrentProfile()
  const supabase = await createClient()
  const entitlement = profile
    ? await getCompanyEntitlement(supabase, profile.company_id)
    : null
  let readOnlyBannerMessage: string | null = null

  if (entitlement?.accessMode === 'read_only') {
    if (entitlement.status === 'trial' && entitlement.isTrialExpired) {
      readOnlyBannerMessage = 'Your trial has ended. Upgrade to continue editing your workspace.'
    } else if (entitlement.status === 'past_due' || entitlement.status === 'suspended') {
      readOnlyBannerMessage = 'Billing issue detected. Workspace is temporarily read-only.'
    } else if (entitlement.status === 'canceled') {
      readOnlyBannerMessage = 'This workspace has been closed. Data is available in read-only mode.'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav
        email={user.email ?? ''}
        fullName={profile?.full_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <main className="container mx-auto py-8 px-4">
        {readOnlyBannerMessage && (
          <Alert className="mb-6">
            <AlertDescription>{readOnlyBannerMessage}</AlertDescription>
          </Alert>
        )}
        {children}
      </main>
    </div>
  )
}
