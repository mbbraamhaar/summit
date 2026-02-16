import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfileLoading() {
  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loading profile...</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Please wait while we load your details.</p>
        </CardContent>
      </Card>
    </div>
  )
}
