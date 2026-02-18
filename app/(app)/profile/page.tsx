import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/helpers'
import { ProfileForm } from '@/components/profile/profile-form'
import { createClient } from '@/lib/supabase/server'
import { getCompanyEntitlement } from '@/lib/subscriptions/helpers'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const { profile } = await getCurrentProfile()

  if (!profile) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const entitlement = await getCompanyEntitlement(supabase, profile.company_id)
  const emailChangeStatus = typeof params.email_change === 'string'
    ? params.email_change
    : undefined

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal profile details.
        </p>
      </div>

      <ProfileForm
        fullName={profile.full_name}
        email={profile.email}
        pendingEmail={profile.pending_email ?? null}
        role={profile.role}
        avatarUrl={profile.avatar_url}
        accessMode={entitlement.accessMode}
        emailChangeStatus={emailChangeStatus}
      />
    </div>
  )
}
