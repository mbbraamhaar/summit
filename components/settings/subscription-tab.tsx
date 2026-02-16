import { Tables } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Subscription = Tables<'subscriptions'> & {
  plan: Tables<'plans'> | null
}

interface SubscriptionTabProps {
  subscription: Subscription | null
  userRole: string
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'trial':
      return 'secondary'
    case 'active':
      return 'default'
    case 'past_due':
    case 'suspended':
      return 'destructive'
    case 'canceled':
      return 'outline'
    default:
      return 'outline'
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function calculateTrialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null
  const now = new Date()
  const trialEnd = new Date(trialEndsAt)
  const diffTime = trialEnd.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

export function SubscriptionTab({ subscription, userRole }: SubscriptionTabProps) {
  const isOwner = userRole === 'owner'
  
  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No subscription</CardTitle>
          <CardDescription>
            You don't have an active subscription yet
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  
  // Calculate trial days left if on trial
  const trialDaysLeft = subscription.status === 'trial' 
    ? calculateTrialDaysLeft(subscription.current_period_end)
    : null
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Your subscription details and billing information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-2xl font-semibold">
                {subscription.plan?.name || 'Unknown Plan'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {subscription.plan?.description}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                €{subscription.plan?.price ? (subscription.plan.price / 100).toFixed(2) : '0.00'}
              </div>
              <div className="text-sm text-muted-foreground">
                per {subscription.plan?.interval || 'month'}
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={getStatusVariant(subscription.status)}>
                {subscription.status}
              </Badge>
            </div>
            
            {subscription.status === 'trial' && trialDaysLeft !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Trial ends in</span>
                <span className="text-sm">
                  {trialDaysLeft === 0 ? 'Today' : `${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'}`}
                </span>
              </div>
            )}
            
            {subscription.status === 'active' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current period</span>
                  <span className="text-sm">
                    {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                  </span>
                </div>
                
                {subscription.cancel_at_period_end && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Cancels on</span>
                    <span className="text-sm">{formatDate(subscription.current_period_end)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          
          {isOwner && (
            <div className="flex gap-2 pt-4">
              <Button variant="outline" disabled>
                Upgrade plan
              </Button>
              {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                <Button variant="outline" disabled>
                  Cancel subscription
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Billing history</CardTitle>
          <CardDescription>
            View your past invoices and payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No billing history available yet
          </p>
          {isOwner && (
            <Button variant="outline" className="mt-4" disabled>
              View billing page
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
