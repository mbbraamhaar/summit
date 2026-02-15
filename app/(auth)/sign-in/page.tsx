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
        <div className="text-sm text-center text-muted-foreground mt-4 space-y-2">
          <p>
            Don't have an account?{' '}
            <Link href="/sign-up" className="text-primary hover:underline">
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
