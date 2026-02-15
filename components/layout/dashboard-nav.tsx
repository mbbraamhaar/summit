'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function DashboardNav() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <nav className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/dashboard" className="text-xl font-bold text-foreground">
            Summit
          </Link>
          <div className="flex space-x-4">
            <Link href="/dashboard" className="text-sm text-foreground hover:text-primary">
              Dashboard
            </Link>
            <Link href="/dashboard/clients" className="text-sm text-foreground hover:text-primary">
              Clients
            </Link>
            <Link href="/dashboard/projects" className="text-sm text-foreground hover:text-primary">
              Projects
            </Link>
            <Link href="/dashboard/invoices" className="text-sm text-foreground hover:text-primary">
              Invoices
            </Link>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Link href="/dashboard/settings" className="text-sm text-foreground hover:text-primary">
            Settings
          </Link>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </nav>
  )
}
