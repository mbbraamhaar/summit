import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/helpers'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // If already logged in, redirect to dashboard
  const { user } = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
