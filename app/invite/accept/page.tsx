import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

function InviteAcceptError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm space-y-4">
        <h1 className="text-xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This invitation is invalid, expired, or already used.
        </p>
        <p className="text-sm text-muted-foreground">
          Ask your workspace owner to send a new invitation.
        </p>
        <Link href="/sign-in" className="inline-block text-sm text-primary hover:underline">
          Return to sign in
        </Link>
      </div>
    </div>
  )
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''

  if (!token) {
    return <InviteAcceptError />
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const redirectPath = `/invite/accept?token=${encodeURIComponent(token)}`
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(redirectPath)}`)
  }

  const { data, error } = await supabase.rpc('accept_invitation', {
    invite_token: token,
    user_email: user.email ?? '',
  })

  if (error) {
    console.error('accept_invitation RPC failed:', error)
    return <InviteAcceptError />
  }

  if (data === 'accepted' || data === 'already_accepted') {
    redirect('/dashboard')
  }

  return <InviteAcceptError />
}
