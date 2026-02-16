import { SignInForm } from '@/components/auth/sign-in-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { getSafeRedirectPath } from '@/lib/auth/redirect'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const redirectTo = getSafeRedirectPath(
    typeof params.redirect === 'string' ? params.redirect : undefined,
    '/dashboard'
  )
  const email = typeof params.email === 'string' ? params.email : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to your Summit account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm redirectTo={redirectTo} initialEmail={email} />
        <div className="text-sm text-center text-muted-foreground mt-4 space-y-2">
          <p>
            Don&apos;t have an account?{' '}
            <Link href={`/sign-up?redirect=${encodeURIComponent(redirectTo)}${email ? `&email=${encodeURIComponent(email)}` : ''}`} className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p>
            <Link href="/reset-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
