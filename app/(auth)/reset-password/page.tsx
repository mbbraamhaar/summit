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
        <p className="text-sm text-center text-muted-foreground mt-4">
          Remember your password?{' '}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
