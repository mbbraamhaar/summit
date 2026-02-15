# CURSOR PROMPT: Build Summit Authentication System

## Context
You are building the authentication system for Summit, a SaaS invoicing app for freelancers. The database and Supabase integration are already set up. You need to build the complete authentication flow including sign-up, sign-in, password reset, and email verification.

## What's Already Done
- ✅ Next.js 16.1.6 with TypeScript and Tailwind CSS
- ✅ Supabase project configured
- ✅ Database schema with workspaces, profiles, plans, subscriptions
- ✅ RLS policies implemented
- ✅ Database triggers (auto-create workspace + profile on signup)
- ✅ Supabase clients: `lib/supabase/server.ts` (async) and `lib/supabase/client.ts`
- ✅ Middleware for session refresh
- ✅ shadcn/ui initialized (install components as needed)
- ✅ TypeScript types in `types/database.ts`

## Critical Technical Details

### Next.js 16 - Async Cookies API
**IMPORTANT:** We're on Next.js 16 which requires async cookie access:

```typescript
// CORRECT (Next.js 16):
import { cookies } from 'next/headers'
const cookieStore = await cookies()

// WRONG (Next.js 14/15):
const cookieStore = cookies() // This will fail!
```

Our Supabase server client already handles this - it's an async function:
```typescript
// Usage:
const supabase = await createClient() // Note the await!
```

### Database Model - Key Facts
1. **One workspace per user** - Email is globally unique
2. **Auto-creation on signup** - DB trigger creates workspace + profile automatically
3. **Roles:** owner (first user) or member (invited users)
4. **Trial period:** 14 days, starts after email verification
5. **Workspace isolation:** All data filtered by workspace_id via RLS

## Your Mission: Build Complete Auth System

### Phase 1: Install Required shadcn/ui Components

```bash
npx shadcn@latest add form
npx shadcn@latest add input
npx shadcn@latest add button
npx shadcn@latest add label
npx shadcn@latest add card
npx shadcn@latest add toast
```

### Phase 2: Create Auth Helper Functions

**File: `lib/auth/helpers.ts`**

Create these helper functions:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Get current user from session
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// Get current user's profile (includes workspace info)
export async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { profile: null, error: null }
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      *,
      workspace:workspaces(*)
    `)
    .eq('id', user.id)
    .single()
  
  return { profile, error }
}

// Require authentication (redirect if not logged in)
export async function requireAuth() {
  const { user } = await getCurrentUser()
  if (!user) {
    redirect('/sign-in')
  }
  return user
}

// Require owner role
export async function requireOwner() {
  const { profile } = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }
  if (profile.role !== 'owner') {
    redirect('/dashboard') // Not authorized
  }
  return profile
}

// Check if user can access workspace features (not suspended/canceled)
export async function canAccessWorkspace() {
  const { profile } = await getCurrentProfile()
  if (!profile?.workspace) return false
  
  const status = profile.workspace.status
  return status === 'trial' || status === 'active'
}
```

### Phase 3: Create Auth Pages

#### **File: `app/(auth)/layout.tsx`**

Layout for auth pages (sign-in, sign-up, etc.):

```typescript
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
```

#### **File: `app/(auth)/sign-up/page.tsx`**

Sign up page:

```typescript
import { SignUpForm } from '@/components/auth/sign-up-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your Summit account</CardTitle>
        <CardDescription>
          Start your 14-day free trial. No credit card required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
        <p className="text-sm text-center text-gray-600 mt-4">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

#### **File: `app/(auth)/sign-in/page.tsx`**

Sign in page:

```typescript
import { SignInForm } from '@/components/auth/sign-in-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to your Summit account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
        <div className="text-sm text-center text-gray-600 mt-4 space-y-2">
          <p>
            Don't have an account?{' '}
            <Link href="/sign-up" className="text-blue-600 hover:underline">
              Sign up
            </Link>
          </p>
          <p>
            <Link href="/reset-password" className="text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
```

#### **File: `app/(auth)/verify-email/page.tsx`**

Email verification success page:

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We've sent you a verification link. Click the link in the email to activate your account and start your free trial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Didn't receive the email? Check your spam folder or contact support.
        </p>
        <Button asChild className="w-full">
          <Link href="/sign-in">Back to Sign In</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
```

#### **File: `app/(auth)/reset-password/page.tsx`**

Password reset request page:

```typescript
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email address and we'll send you a password reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
        <p className="text-sm text-center text-gray-600 mt-4">
          Remember your password?{' '}
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

#### **File: `app/(auth)/update-password/page.tsx`**

Set new password page (after clicking reset link):

```typescript
import { UpdatePasswordForm } from '@/components/auth/update-password-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set new password</CardTitle>
        <CardDescription>
          Choose a strong password for your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  )
}
```

### Phase 4: Create Auth Forms (Server Actions)

#### **File: `components/auth/sign-up-form.tsx`**

Sign up form with validation:

```typescript
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
import { useToast } from '@/hooks/use-toast'

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type SignUpFormData = z.infer<typeof signUpSchema>

export function SignUpForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  })

  async function onSubmit(data: SignUpFormData) {
    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setIsLoading(false)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
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
          <p className="text-sm text-red-600 mt-1">{errors.fullName.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
        )}
      </div>

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
          <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  )
}
```

#### **File: `components/auth/sign-in-form.tsx`**

Sign in form:

```typescript
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
import { useToast } from '@/hooks/use-toast'

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export function SignInForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  })

  async function onSubmit(data: SignInFormData) {
    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    setIsLoading(false)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
      return
    }

    // Success - redirect to dashboard
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
        )}
      </div>

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
          <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  )
}
```

#### **File: `components/auth/reset-password-form.tsx`**

Password reset request form:

```typescript
'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  async function onSubmit(data: ResetPasswordFormData) {
    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    setIsLoading(false)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
      return
    }

    setEmailSent(true)
    toast({
      title: 'Email sent',
      description: 'Check your email for a password reset link.',
    })
  }

  if (emailSent) {
    return (
      <div className="text-center text-sm text-gray-600">
        <p>We've sent you an email with a password reset link.</p>
        <p className="mt-2">Please check your inbox and spam folder.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send reset link'}
      </Button>
    </form>
  )
}
```

#### **File: `components/auth/update-password-form.tsx`**

Set new password form:

```typescript
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
import { useToast } from '@/hooks/use-toast'

const updatePasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>

export function UpdatePasswordForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  })

  async function onSubmit(data: UpdatePasswordFormData) {
    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    })

    setIsLoading(false)

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Password updated',
      description: 'Your password has been successfully updated.',
    })

    router.push('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="password">New Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
          disabled={isLoading}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600 mt-1">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Update password'}
      </Button>
    </form>
  )
}
```

### Phase 5: Auth Callback Handler

**File: `app/auth/callback/route.ts`**

Handle email verification and OAuth callbacks:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to dashboard after successful verification
  return NextResponse.redirect(new URL('/dashboard', request.url))
}
```

### Phase 6: Protected Dashboard (Example)

#### **File: `app/(dashboard)/layout.tsx`**

Dashboard layout with navigation:

```typescript
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
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <main className="container mx-auto py-8 px-4">
        {children}
      </main>
    </div>
  )
}
```

#### **File: `app/(dashboard)/dashboard/page.tsx`**

Dashboard homepage:

```typescript
import { getCurrentProfile } from '@/lib/auth/helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const { profile } = await getCurrentProfile()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">
        Welcome back, {profile?.full_name || 'there'}!
      </h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your Workspace</CardTitle>
            <CardDescription>{profile?.workspace?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Status: <span className="font-medium">{profile?.workspace?.status}</span>
            </p>
            <p className="text-sm text-gray-600">
              Role: <span className="font-medium">{profile?.role}</span>
            </p>
          </CardContent>
        </Card>

        {/* Add more dashboard cards here */}
      </div>
    </div>
  )
}
```

#### **File: `components/layout/dashboard-nav.tsx`**

Navigation component with sign-out:

```typescript
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
    <nav className="bg-white border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/dashboard" className="text-xl font-bold">
            Summit
          </Link>
          <div className="flex space-x-4">
            <Link href="/dashboard" className="text-sm hover:text-blue-600">
              Dashboard
            </Link>
            <Link href="/dashboard/clients" className="text-sm hover:text-blue-600">
              Clients
            </Link>
            <Link href="/dashboard/projects" className="text-sm hover:text-blue-600">
              Projects
            </Link>
            <Link href="/dashboard/invoices" className="text-sm hover:text-blue-600">
              Invoices
            </Link>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Link href="/dashboard/settings" className="text-sm hover:text-blue-600">
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
```

### Phase 7: Add Toaster Component

**File: `app/layout.tsx`** (update existing file)

Add Toaster to root layout:

```typescript
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

### Phase 8: Update Homepage

**File: `app/page.tsx`** (update existing file)

Simple homepage with sign-up CTA:

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Summit
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Automate your freelance invoicing
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/sign-up">Start Free Trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
```

## Requirements & Validation

### Form Validation Rules
- **Full Name:** Minimum 2 characters
- **Email:** Valid email format
- **Password:** Minimum 8 characters

### Error Handling
- Show toast notifications for all errors
- Display field-specific errors under inputs
- Handle Supabase auth errors gracefully
- Show loading states during async operations

### Security
- All forms use client-side validation (Zod)
- Password never sent unencrypted (HTTPS in production)
- Session cookies are httpOnly (handled by Supabase)
- No sensitive data in client-side code

### User Experience
- Clear success messages
- Helpful error messages (not technical jargon)
- Loading indicators for all async actions
- Responsive design (mobile-friendly)

## Testing Checklist

After building, test these flows:

1. **Sign Up Flow:**
   - [ ] Fill form → Create account
   - [ ] Receive verification email
   - [ ] Click email link → Email verified
   - [ ] Redirect to dashboard
   - [ ] Profile and workspace created automatically

2. **Sign In Flow:**
   - [ ] Enter credentials → Sign in successful
   - [ ] Redirect to dashboard
   - [ ] Session persists across page reloads

3. **Password Reset Flow:**
   - [ ] Request reset → Receive email
   - [ ] Click email link → Redirect to update password
   - [ ] Set new password → Success
   - [ ] Can sign in with new password

4. **Navigation:**
   - [ ] Unauthenticated users can't access /dashboard
   - [ ] Authenticated users redirect from /sign-in to /dashboard
   - [ ] Sign out works and redirects to /sign-in

5. **Database:**
   - [ ] Workspace created with correct name and slug
   - [ ] Profile created with role='owner'
   - [ ] Trial period set to 14 days from signup

## Important Notes

1. **Supabase Email Settings:** Make sure email templates are configured in Supabase dashboard
2. **Redirect URLs:** Ensure `http://localhost:3000/**` is in allowed redirect URLs
3. **Database Triggers:** The workspace and profile are created automatically - no manual creation needed
4. **Toast Hook:** Import from `@/hooks/use-toast` (installed with shadcn toast component)

## Deliverables

After completing this prompt, you should have:

- ✅ Complete authentication system (sign-up, sign-in, password reset)
- ✅ Email verification flow
- ✅ Protected dashboard routes
- ✅ Auth helper functions
- ✅ Navigation with sign-out
- ✅ All forms with validation
- ✅ Toast notifications
- ✅ Working session management

## Next Steps (Not Part of This Prompt)

After authentication is complete, we'll build:
- User profile editing
- Workspace settings
- Member invitation system
- Subscription/billing integration with Mollie

---

**Focus on getting the authentication system working end-to-end before moving to other features.**
