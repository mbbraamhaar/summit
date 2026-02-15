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
        <p className="text-sm text-muted-foreground mb-4">
          Didn't receive the email? Check your spam folder or contact support.
        </p>
        <Button asChild className="w-full">
          <Link href="/sign-in">Back to Sign In</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
