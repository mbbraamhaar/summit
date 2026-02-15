import { requireAuth } from '@/lib/auth/helpers'
import { DashboardNav } from '@/components/layout/dashboard-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Require authentication
  await requireAuth()

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="container mx-auto py-8 px-4">
        {children}
      </main>
    </div>
  )
}
