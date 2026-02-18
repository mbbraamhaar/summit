'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import {
  cancelEmailChange,
  removeAvatar,
  requestEmailChange,
  resendEmailChangeVerification,
  updateProfile,
  uploadAvatar,
} from '@/app/(app)/profile/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_FILE_SIZE_BYTES,
  getAvatarInitials,
  getAvatarPlaceholderMessage,
} from '@/lib/profile/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type CompanyAccessMode } from '@/lib/subscriptions/helpers'

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
  pendingEmail: string | null
  role: string
  avatarUrl: string | null
  accessMode: CompanyAccessMode
  emailChangeStatus?: string
}

export function ProfileForm({
  fullName,
  email,
  pendingEmail,
  role,
  avatarUrl,
  accessMode,
  emailChangeStatus,
}: ProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [currentEmail] = useState(email)
  const [currentPendingEmail, setCurrentPendingEmail] = useState(pendingEmail)
  const [emailInput, setEmailInput] = useState(pendingEmail ?? '')
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false)
  const [isResendingEmailChange, setIsResendingEmailChange] = useState(false)
  const [isCancellingEmailChange, setIsCancellingEmailChange] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false)
  const [avatarFileError, setAvatarFileError] = useState<string | null>(null)
  const isReadOnly = accessMode === 'read_only'

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
      if (result.error === 'WORKSPACE_READ_ONLY') {
        toast.error('Workspace is read-only.')
        return
      }
      toast.error('Failed to update profile', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    toast.success('Profile updated')
  }

  async function onUploadAvatar() {
    if (!selectedAvatarFile || isUploading) {
      return
    }

    setIsUploading(true)

    const formData = new FormData()
    formData.append('avatar', selectedAvatarFile)

    const result = await uploadAvatar(formData)
    setIsUploading(false)

    if (!result.success) {
      if (result.error === 'WORKSPACE_READ_ONLY') {
        toast.error('Workspace is read-only.')
        return
      }
      toast.error('Failed to upload avatar', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    setCurrentAvatarUrl(result.avatar_url ?? null)
    setSelectedAvatarFile(null)
    toast.success('Avatar uploaded')
  }

  async function onRemoveAvatar() {
    if (!currentAvatarUrl || isRemovingAvatar) {
      return
    }

    setIsRemovingAvatar(true)
    const result = await removeAvatar()
    setIsRemovingAvatar(false)

    if (!result.success) {
      if (result.error === 'WORKSPACE_READ_ONLY') {
        toast.error('Workspace is read-only.')
        return
      }
      toast.error('Failed to remove avatar', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    setCurrentAvatarUrl(null)
    setSelectedAvatarFile(null)
    setAvatarFileError(null)
    toast.success('Avatar removed')
  }

  async function onRequestEmailChange() {
    if (isRequestingEmailChange) {
      return
    }

    setIsRequestingEmailChange(true)
    const formData = new FormData()
    formData.append('email', emailInput)

    const result = await requestEmailChange(formData)
    setIsRequestingEmailChange(false)

    if (!result.success) {
      toast.error('Failed to request email change', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    const nextPendingEmail = result.pendingEmail ?? emailInput.trim().toLowerCase()
    setCurrentPendingEmail(nextPendingEmail)
    setEmailInput(nextPendingEmail)

    toast.success('Verification email sent', {
      description: `Check ${nextPendingEmail} to confirm this change.`,
    })
  }

  async function onResendEmailChangeVerification() {
    if (isResendingEmailChange) {
      return
    }

    setIsResendingEmailChange(true)
    const result = await resendEmailChangeVerification()
    setIsResendingEmailChange(false)

    if (!result.success) {
      toast.error('Failed to resend verification email', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    toast.success('Verification email resent')
  }

  async function onCancelEmailChange() {
    if (isCancellingEmailChange) {
      return
    }

    setIsCancellingEmailChange(true)
    const result = await cancelEmailChange()
    setIsCancellingEmailChange(false)

    if (!result.success) {
      toast.error('Failed to cancel email change', {
        description: result.error ?? 'Please try again.',
      })
      return
    }

    setCurrentPendingEmail(null)
    setEmailInput('')
    toast.success('Pending email change canceled')
  }

  function handleAvatarFileChange(file: File | null) {
    setAvatarFileError(null)

    if (!file) {
      setSelectedAvatarFile(null)
      return
    }

    if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
      setSelectedAvatarFile(null)
      setAvatarFileError('Only JPG, PNG, and WebP files are allowed.')
      return
    }

    if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
      setSelectedAvatarFile(null)
      setAvatarFileError('Avatar must be 2MB or smaller.')
      return
    }

    setSelectedAvatarFile(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          type="submit"
          form="profile-form"
          disabled={isReadOnly || !isDirty || isSaving}
          className="w-full sm:w-auto"
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Your account details and display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Your full name"
                {...register('fullName')}
                disabled={isReadOnly || isSaving}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentEmail">Current email</Label>
              <Input id="currentEmail" type="email" value={currentEmail} disabled readOnly />

              <Label htmlFor="newEmail">New email</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="newEmail"
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  disabled={isRequestingEmailChange || isResendingEmailChange}
                />
                <Button
                  type="button"
                  onClick={onRequestEmailChange}
                  disabled={isRequestingEmailChange || isResendingEmailChange || emailInput.trim().length === 0}
                >
                  {isRequestingEmailChange ? 'Sending...' : 'Send verification'}
                </Button>
              </div>

              {currentPendingEmail && (
                <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                  <p className="text-sm">
                    Pending change to <span className="font-medium">{currentPendingEmail}</span>.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click the verification link sent to that address to complete the update.
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={onResendEmailChangeVerification}
                    disabled={isRequestingEmailChange || isResendingEmailChange || isCancellingEmailChange}
                  >
                    {isResendingEmailChange ? 'Resending...' : 'Resend verification email'}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="ml-3 mt-1 h-auto p-0 text-xs text-destructive hover:text-destructive/90"
                    onClick={onCancelEmailChange}
                    disabled={isRequestingEmailChange || isResendingEmailChange || isCancellingEmailChange}
                  >
                    {isCancellingEmailChange ? 'Cancelling...' : 'Cancel pending change'}
                  </Button>
                </div>
              )}

              {emailChangeStatus === 'success' && (
                <p className="text-xs text-green-600">
                  Email verified. Your account now uses the updated email address.
                </p>
              )}
              {emailChangeStatus === 'pending' && (
                <p className="text-xs text-muted-foreground">
                  Verification is still pending. Check your inbox and click the latest link.
                </p>
              )}
              {emailChangeStatus === 'invalid' && (
                <p className="text-xs text-destructive">
                  Verification link is invalid or expired. Request a new email change.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" type="text" value={role} disabled readOnly />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>
            Upload a profile image that appears in your account navigation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={currentAvatarUrl || undefined} alt={`${fullName ?? email} avatar`} />
              <AvatarFallback>{getAvatarInitials(fullName, email)}</AvatarFallback>
            </Avatar>
            <p className="text-sm text-muted-foreground">Current avatar</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar">Upload new avatar</Label>
            <Input
              id="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleAvatarFileChange(e.target.files?.[0] ?? null)}
              disabled={isReadOnly || isUploading}
              aria-invalid={Boolean(avatarFileError)}
            />
            {avatarFileError && (
              <p className="text-sm text-destructive">{avatarFileError}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={onUploadAvatar}
              disabled={isReadOnly || !selectedAvatarFile || isUploading || isRemovingAvatar}
              className="w-full sm:w-auto"
            >
              {isUploading ? 'Uploading...' : 'Upload avatar'}
            </Button>
            {currentAvatarUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={onRemoveAvatar}
                disabled={isReadOnly || isUploading || isRemovingAvatar}
                className="w-full sm:w-auto"
              >
                {isRemovingAvatar ? 'Removing...' : 'Remove avatar'}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {getAvatarPlaceholderMessage()}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
