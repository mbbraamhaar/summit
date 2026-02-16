'use client'

import { useState } from 'react'
import { Tables } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { createInvitation, removeMember, revokeInvitation } from '@/app/(app)/settings/actions'

type Profile = Tables<'profiles'>
type Invitation = Pick<Tables<'invitations'>, 'id' | 'email' | 'status' | 'expires_at' | 'created_at'>

interface MembersTabProps {
  members: Profile[]
  pendingInvitations: Invitation[]
  currentUserId: string
  userRole: string
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function getRoleVariant(role: string): 'default' | 'secondary' {
  return role === 'owner' ? 'default' : 'secondary'
}

export function MembersTab({
  members,
  pendingInvitations,
  currentUserId,
  userRole,
}: MembersTabProps) {
  const isOwner = userRole === 'owner'
  const [inviteEmail, setInviteEmail] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<Profile | null>(null)
  const [isRemovingMember, setIsRemovingMember] = useState(false)

  async function handleInvite() {
    if (!isOwner) return

    setIsInviting(true)
    const formData = new FormData()
    formData.append('email', inviteEmail)

    const result = await createInvitation(formData)
    setIsInviting(false)

    if (!result.success) {
      toast.error('Failed to send invitation', {
        description: result.error || 'Please try again.',
      })
      return
    }

    setInviteEmail('')
    toast.success('Invitation sent')
  }

  async function handleRevoke(invitationId: string) {
    if (!isOwner) return

    setRevokingId(invitationId)
    const formData = new FormData()
    formData.append('invitationId', invitationId)
    const result = await revokeInvitation(formData)
    setRevokingId(null)

    if (!result.success) {
      toast.error('Failed to revoke invitation', {
        description: result.error || 'Please try again.',
      })
      return
    }

    toast.success('Invitation revoked')
  }

  async function handleConfirmRemove() {
    if (!memberToRemove || !isOwner) return

    setIsRemovingMember(true)
    const formData = new FormData()
    formData.append('memberId', memberToRemove.id)

    const result = await removeMember(formData)
    setIsRemovingMember(false)

    if (!result.success) {
      toast.error('Failed to remove member', {
        description: result.error || 'Please try again.',
      })
      return
    }

    toast.success('Member removed')
    setMemberToRemove(null)
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                Manage who has access to your company
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isOwner && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Invite member</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="member@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={isInviting}
                />
                <Button
                  type="button"
                  onClick={handleInvite}
                  disabled={isInviting || inviteEmail.trim().length === 0}
                >
                  {isInviting ? 'Sending...' : 'Send invite'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Invitations expire automatically after 7 days.
              </p>
            </div>
          )}

          {isOwner && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Pending invitations</p>
              {pendingInvitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations</p>
              ) : (
                <div className="space-y-2">
                  {pendingInvitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevoke(invitation.id)}
                        disabled={revokingId === invitation.id}
                      >
                        {revokingId === invitation.id ? 'Revoking...' : 'Revoke'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No members found
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const isCurrentUser = member.id === currentUserId
                  
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between border-b pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback>
                            {getInitials(member.full_name, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium leading-none">
                              {member.full_name || member.email}
                            </p>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant={getRoleVariant(member.role)}>
                          {member.role}
                        </Badge>
                        
                        {isOwner && !isCurrentUser && member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMemberToRemove(member)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Need access?</CardTitle>
            <CardDescription>
              Contact a company owner to manage members or subscription
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Dialog open={Boolean(memberToRemove)} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {memberToRemove
                ? `Are you sure you want to remove ${memberToRemove.full_name || memberToRemove.email}?`
                : 'Are you sure you want to remove this member?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberToRemove(null)}
              disabled={isRemovingMember}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={isRemovingMember}
            >
              {isRemovingMember ? 'Removing...' : 'Remove member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
