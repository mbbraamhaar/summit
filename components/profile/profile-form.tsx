'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { updateProfile } from '@/app/(app)/profile/actions'
import { getAvatarPlaceholderMessage, isAvatarUploadEnabled } from '@/lib/profile/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface ProfileFormProps {
  fullName: string | null
  email: string
  role: string
  avatarUrl: string | null
}

export function ProfileForm({ fullName, email, role, avatarUrl }: ProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const avatarUploadEnabled = isAvatarUploadEnabled()

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: fullName ?? '',
    },
  })

  async function onSubmit(values: ProfileFormData) {
    setIsSaving(true)

    const formData = new FormData()
    formData.append('full_name', values.fullName)

    const result = await updateProfile(formData)
    setIsSaving(false)

    if (!result.success) {
      toast.error('Failed to update profile', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    toast.success('Profile updated')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Your account details and display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Your full name"
                {...register('fullName')}
                disabled={isSaving}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} disabled readOnly />
              <p className="text-xs text-muted-foreground">
                Email changes are not available yet.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" type="text" value={role} disabled readOnly />
            </div>

            <Button type="submit" disabled={!isDirty || isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>
            Upload support is being finalized. Current avatar URL is shown below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" disabled={!avatarUploadEnabled} />
          <p className="text-xs text-muted-foreground">
            {getAvatarPlaceholderMessage()}
          </p>
          <p className="text-xs text-muted-foreground break-all">
            Current avatar URL: {avatarUrl || 'None set'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
