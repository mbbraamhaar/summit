import { getCurrentProfile, requireAuth } from '@/lib/auth/helpers'
import { DashboardNav } from '@/components/layout/dashboard-nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const { profile } = await getCurrentProfile()

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav
        email={user.email ?? ''}
        fullName={profile?.full_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <main className="container mx-auto py-8 px-4">
        {children}
      </main>
    </div>
  )
}
