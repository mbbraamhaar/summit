import { getCurrentProfile } from '@/lib/auth/helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const { profile } = await getCurrentProfile()

  return (
    <div>
      <h1 className="text-3xl font-bold text-foreground mb-6">
        Welcome back, {profile?.full_name || 'there'}!
      </h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your Workspace</CardTitle>
            <CardDescription>{profile?.workspace?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Status: <span className="font-medium text-foreground">{profile?.workspace?.status}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Role: <span className="font-medium text-foreground">{profile?.role}</span>
            </p>
          </CardContent>
        </Card>

        {/* Add more dashboard cards here */}
      </div>
    </div>
  )
}
