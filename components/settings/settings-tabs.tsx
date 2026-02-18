'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Tables } from '@/types/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CompanyForm } from '@/components/settings/company-form'
import { SubscriptionTab } from '@/components/settings/subscription-tab'
import { MembersTab } from '@/components/settings/members-tab'
import { type CompanyAccessMode } from '@/lib/subscriptions/helpers'

type Company = Tables<'companies'>
type Subscription = Tables<'subscriptions'> & {
  plan: Tables<'plans'> | null
}
type Profile = Tables<'profiles'>
type Invitation = Pick<Tables<'invitations'>, 'id' | 'email' | 'status' | 'expires_at' | 'created_at'>

interface SettingsTabsProps {
  activeTab: string
  company: Company
  companyAccessMode: CompanyAccessMode
  userRole: string
  subscription: Subscription | null
  members: Profile[]
  pendingInvitations: Invitation[]
  currentUserId: string
}

interface CompanySaveState {
  isDirty: boolean
  isSaving: boolean
}

export function SettingsTabs({
  activeTab,
  company,
  companyAccessMode,
  userRole,
  subscription,
  members,
  pendingInvitations,
  currentUserId,
}: SettingsTabsProps) {
  const [effectiveAccessMode, setEffectiveAccessMode] = useState<CompanyAccessMode>(companyAccessMode)
  const [companySaveState, setCompanySaveState] = useState<CompanySaveState>({
    isDirty: false,
    isSaving: false,
  })
  const [requestCompanySave, setRequestCompanySave] = useState<(() => void) | null>(null)
  const handleSaveRequestRegister = useCallback((save: (() => void) | null) => {
    setRequestCompanySave(() => save)
  }, [])

  useEffect(() => {
    setEffectiveAccessMode(companyAccessMode)
  }, [companyAccessMode])

  const isReadOnly = effectiveAccessMode === 'read_only'
  const showSaveButton = activeTab === 'company' && userRole === 'owner'

  return (
    <Tabs value={activeTab} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="company" asChild>
            <a href="/settings?tab=company">Company</a>
          </TabsTrigger>
          <TabsTrigger value="subscription" asChild>
            <a href="/settings?tab=subscription">Subscription</a>
          </TabsTrigger>
          <TabsTrigger value="members" asChild>
            <a href="/settings?tab=members">Members</a>
          </TabsTrigger>
        </TabsList>

        {showSaveButton && (
          <Button
            type="button"
            onClick={() => requestCompanySave?.()}
            disabled={isReadOnly || !companySaveState.isDirty || companySaveState.isSaving || !requestCompanySave}
            className="w-full sm:w-auto sm:min-w-[160px]"
          >
            {companySaveState.isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        )}
      </div>

      {isReadOnly && (
        <Alert>
          <AlertDescription>
            {company.status === 'canceled'
              ? 'Workspace is closed (read-only).'
              : 'Workspace is read-only.'}
          </AlertDescription>
        </Alert>
      )}

      <TabsContent value="company" className="space-y-6">
        <CompanyForm
          company={company}
          userRole={userRole}
          companyAccessMode={effectiveAccessMode}
          onWorkspaceClosed={() => setEffectiveAccessMode('read_only')}
          onSaveStateChange={setCompanySaveState}
          onSaveRequestRegister={handleSaveRequestRegister}
        />
      </TabsContent>

      <TabsContent value="subscription" className="space-y-6">
        <SubscriptionTab subscription={subscription} userRole={userRole} />
      </TabsContent>

      <TabsContent value="members" className="space-y-6">
        <MembersTab
          members={members}
          pendingInvitations={pendingInvitations}
          currentUserId={currentUserId}
          userRole={userRole}
        />
      </TabsContent>
    </Tabs>
  )
}
