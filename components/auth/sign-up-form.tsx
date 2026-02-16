'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  companyName: z.string()
    .max(100, 'Company name must be less than 100 characters')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type SignUpFormData = z.infer<typeof signUpSchema>

interface SignUpFormProps {
  inviteToken?: string
  inviteEmail?: string
}

export function SignUpForm({ inviteToken, inviteEmail }: SignUpFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const isInviteFlow = Boolean(inviteToken)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: inviteEmail || '',
    },
  })

  async function onSubmit(data: SignUpFormData) {
    if (!isInviteFlow && (!data.companyName || data.companyName.trim().length < 2)) {
      toast.error('Error', {
        description: 'Company name must be at least 2 characters',
      })
      return
    }

    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          company_name: isInviteFlow ? undefined : data.companyName,
          invite_token: inviteToken,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setIsLoading(false)

    if (error) {
      toast.error('Error', {
        description: error.message,
      })
      return
    }

    // Success - redirect to verification page
    router.push('/verify-email')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          type="text"
          placeholder="John Doe"
          {...register('fullName')}
          disabled={isLoading}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive mt-1">{errors.fullName.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          disabled={isLoading || Boolean(inviteEmail)}
          readOnly={Boolean(inviteEmail)}
        />
        {errors.email && (
          <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
        )}
        {inviteEmail && (
          <p className="text-xs text-muted-foreground mt-1">
            This invitation is tied to {inviteEmail}.
          </p>
        )}
      </div>

      {!isInviteFlow && (
        <div>
          <Label htmlFor="companyName">Company Name</Label>
          <Input
            id="companyName"
            type="text"
            placeholder="Acme Inc"
            {...register('companyName')}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            This will be your company name on invoices
          </p>
          {errors.companyName && (
            <p className="text-sm text-destructive mt-1">{errors.companyName.message}</p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  )
}
