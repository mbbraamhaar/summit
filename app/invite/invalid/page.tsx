import Link from 'next/link'

export default function InviteInvalidPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm space-y-4">
        <h1 className="text-xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This invitation is invalid or expired.
        </p>
        <p className="text-sm text-muted-foreground">
          Ask your workspace owner to resend.
        </p>
        <Link href="/auth/sign-in" className="inline-block text-sm text-primary hover:underline">
          Return to sign in
        </Link>
      </div>
    </div>
  )
}
