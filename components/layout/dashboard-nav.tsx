'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarInitials } from '@/lib/profile/avatar'

interface DashboardNavProps {
  email: string
  fullName: string | null
  avatarUrl: string | null
}

export function DashboardNav({ email, fullName, avatarUrl }: DashboardNavProps) {
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
            <Link href="/clients" className="text-sm text-foreground hover:text-primary">
              Clients
            </Link>
            <Link href="/projects" className="text-sm text-foreground hover:text-primary">
              Projects
            </Link>
            <Link href="/invoices" className="text-sm text-foreground hover:text-primary">
              Invoices
            </Link>
            <Link href="/settings" className="text-sm text-foreground hover:text-primary">
              Settings
            </Link>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Avatar className="h-9 w-9" aria-label="User avatar">
            <AvatarImage src={avatarUrl || undefined} alt={`${fullName ?? email} avatar`} />
            <AvatarFallback>{getAvatarInitials(fullName, email)}</AvatarFallback>
          </Avatar>
          <Link href="/profile" className="text-sm text-foreground hover:text-primary">
            Profile
          </Link>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </nav>
  )
}
