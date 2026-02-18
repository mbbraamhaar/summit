import { SignUpForm } from '@/components/auth/sign-up-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { getSafeRedirectPath } from '@/lib/auth/redirect'
import { cookies } from 'next/headers'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const redirectParam = typeof params.redirect === 'string' ? params.redirect : undefined
  const legacyInviteToken = typeof params.invite === 'string' ? params.invite : undefined
  const redirectTo = getSafeRedirectPath(
    redirectParam || (legacyInviteToken ? `/invite/accept?token=${encodeURIComponent(legacyInviteToken)}` : undefined),
    '/dashboard'
  )
  const isInviteFlow = redirectTo.startsWith('/invite/accept')
  const cookieStore = await cookies()
  const inviteEmailFromQuery = typeof params.email === 'string' ? params.email : undefined
  const inviteEmailFromCookie = isInviteFlow ? cookieStore.get('invite_email')?.value : undefined
  const inviteEmail = inviteEmailFromQuery || inviteEmailFromCookie
  const invitedCompanyId = isInviteFlow ? cookieStore.get('invited_company_id')?.value : undefined

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
        <SignUpForm
          redirectTo={redirectTo}
          inviteEmail={inviteEmail}
          invitedCompanyId={invitedCompanyId}
        />
        <p className="text-sm text-center text-muted-foreground mt-4">
          Already have an account?{' '}
          <Link href={`/sign-in?redirect=${encodeURIComponent(redirectTo)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ''}`} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
