import { SignUpForm } from '@/components/auth/sign-up-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const inviteToken = typeof params.invite === 'string' ? params.invite : undefined
  const inviteEmail = typeof params.email === 'string' ? params.email : undefined
  const isInviteFlow = Boolean(inviteToken)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isInviteFlow ? 'Accept invitation' : 'Create your Summit account'}</CardTitle>
        <CardDescription>
          {isInviteFlow
            ? 'Create your account to join your team workspace.'
            : 'Start your 14-day free trial. No credit card required.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm inviteToken={inviteToken} inviteEmail={inviteEmail} />
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
