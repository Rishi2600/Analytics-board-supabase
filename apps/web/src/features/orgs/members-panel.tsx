import { Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/data/confirm-dialog'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import { InviteDialog } from './invite-dialog'
import { useOrgMembers, useRemoveMember, useUpdateMemberRole, type OrgMember } from './members-api'

export function MembersPanel({ orgId }: { orgId: string }) {
  const { user } = useAuth()
  const members = useOrgMembers(orgId)
  const updateRole = useUpdateMemberRole(orgId)
  const removeMember = useRemoveMember(orgId)
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<OrgMember | null>(null)
  // Changing your own role can lock you out of this screen, and only someone else can undo
  // it, so that one change asks first. Other people's roles change straight away.
  const [ownRole, setOwnRole] = useState<OrgMember['role'] | null>(null)
  const me = members.data?.find((m) => m.user_id === user?.id)

  const onRoleChange = (member: OrgMember, role: OrgMember['role']) => {
    updateRole.mutate(
      { userId: member.user_id, role },
      {
        onSettled: () => {
          setOwnRole(null)
        },
        onSuccess: () =>
          toast.success(`${member.email} is now ${ROLE_LABELS[role]?.toLowerCase() ?? role}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const onRemove = async () => {
    if (!removing) return
    try {
      await removeMember.mutateAsync(removing.user_id)
      toast.success('Member removed')
      setRemoving(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <DataCard
      title="Members"
      description="Everyone in this organization can see its projects. Roles decide what else they can do."
      action={
        <Button
          onClick={() => {
            setInviting(true)
          }}
        >
          Invite member
        </Button>
      }
      footer="An organization always keeps at least one owner. The last owner cannot be removed or given a lower role."
    >
      {members.isPending ? (
        <TableSkeleton rows={3} columns={3} />
      ) : members.isError ? (
        <ErrorState
          title="The member list did not load"
          description="Everyone's access is unchanged; this is a read that failed. Try again."
          error={members.error}
          onRetry={() => void members.refetch()}
        />
      ) : members.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Invite the people who need to read or manage this organization's data."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
              <TableHead className="pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((member) => (
              <TableRow key={member.user_id} className="group/row">
                <TableCell className="pl-4 font-medium wrap-anywhere whitespace-normal">
                  {member.email}{' '}
                  {member.user_id === user?.id ? <Badge variant="secondary">You</Badge> : null}
                </TableCell>
                <TableCell>
                  <Select
                    value={member.role}
                    onValueChange={(role) => {
                      if (member.user_id === user?.id) setOwnRole(role as OrgMember['role'])
                      else onRoleChange(member, role as OrgMember['role'])
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-32"
                      aria-label={`Role for ${member.email}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(['owner', 'admin', 'member', 'viewer'] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {ROLE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatRelative(member.created_at)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="row-actions"
                    aria-label={`Remove ${member.email}`}
                    onClick={() => {
                      setRemoving(member)
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <InviteDialog orgId={orgId} open={inviting} onOpenChange={setInviting} />

      <ConfirmDialog
        open={ownRole !== null}
        onOpenChange={(open) => {
          if (!open) setOwnRole(null)
        }}
        title={`Make yourself ${ROLE_LABELS[ownRole ?? 'viewer']?.toLowerCase() ?? ''}?`}
        description="Your access changes straight away. If this role cannot manage people, you will not be able to change it back; someone else in the organization will have to."
        confirmLabel="Change my role"
        pendingLabel="Changing role"
        pending={updateRole.isPending}
        onConfirm={() => {
          if (me && ownRole) onRoleChange(me, ownRole)
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove ${removing?.email ?? 'this member'}?`}
        description={
          removing?.user_id === user?.id
            ? 'You lose access to this organization and all of its projects straight away. Someone else would have to invite you back.'
            : 'They lose access to this organization and all of its projects straight away. Their account is not deleted, and you can invite them again.'
        }
        confirmLabel="Remove member"
        pendingLabel="Removing member"
        pending={removeMember.isPending}
        onConfirm={() => void onRemove()}
      />
    </DataCard>
  )
}
