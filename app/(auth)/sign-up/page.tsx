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
        <p className="text-sm text-center text-muted-foreground mt-4">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
