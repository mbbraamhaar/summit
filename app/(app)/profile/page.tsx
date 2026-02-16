import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/helpers'
import { ProfileForm } from '@/components/profile/profile-form'

export default async function ProfilePage() {
  const { profile } = await getCurrentProfile()

  if (!profile) {
    redirect('/dashboard')
  }

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
        role={profile.role}
        avatarUrl={profile.avatar_url}
      />
    </div>
  )
}
