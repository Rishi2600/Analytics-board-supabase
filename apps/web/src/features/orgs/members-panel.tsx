import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
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
import { errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import {
  useCreateInvite,
  useOrgMembers,
  useRemoveMember,
  useUpdateMemberRole,
  type OrgMember,
} from './members-api'

const ROLE_HELP: Record<OrgMember['role'], string> = {
  owner: 'Everything, including deleting the organization',
  admin: 'Projects, keys and people',
  member: 'Read the dashboard and save views',
  viewer: 'Read only',
}

export function MembersPanel({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId)
  const updateRole = useUpdateMemberRole(orgId)
  const removeMember = useRemoveMember(orgId)
  const createInvite = useCreateInvite(orgId)

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const onInvite = async () => {
    try {
      const created = await createInvite.mutateAsync({ email: email.trim(), role })
      setInviteLink(`${window.location.origin}/invite/${created.token}`)
      toast.success('Invite created')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onCopyLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not reach the clipboard. Select the link and copy it manually.')
    }
  }

  const closeInvite = () => {
    setInviting(false)
    setInviteLink(null)
    setEmail('')
    setCopied(false)
  }

  return (
    <section>
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-sm font-medium">Members</h2>
        <Button
          size="sm"
          onClick={() => {
            setInviting(true)
          }}
        >
          Invite member
        </Button>
      </div>

      {members.isPending ? (
        <TableSkeleton rows={3} columns={3} />
      ) : members.isError ? (
        <ErrorState
          title="We could not load the member list"
          description="Everyone's access is unchanged. This is a read that failed, not a permission problem."
          error={members.error}
          onRetry={() => void members.refetch()}
        />
      ) : members.data.length === 0 ? (
        <EmptyState
          title="No members yet"
          description="Invite the people who need to read or manage this project's data."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((member) => (
              <TableRow key={member.user_id} className="group">
                <TableCell className="font-medium">{member.email}</TableCell>
                <TableCell>
                  <Select
                    value={member.role}
                    onValueChange={(next) => {
                      updateRole.mutate(
                        { userId: member.user_id, role: next as OrgMember['role'] },
                        {
                          onError: (error) => {
                            toast.error(errorMessage(error))
                          },
                          onSuccess: () => {
                            toast.success('Role updated')
                          },
                        },
                      )
                    }}
                  >
                    <SelectTrigger className="h-8 w-36" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['owner', 'admin', 'member', 'viewer'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="border-l text-xs text-muted-foreground">
                  {formatRelative(member.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => {
                      removeMember.mutate(member.user_id, {
                        onError: (error) => {
                          toast.error(errorMessage(error))
                        },
                        onSuccess: () => {
                          toast.success('Member removed')
                        },
                      })
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

      <p className="border-t px-6 py-3 text-xs text-muted-foreground">
        An organization always keeps at least one owner. The last owner cannot be removed or
        demoted.
      </p>

      <Dialog
        open={inviting}
        onOpenChange={(open) => {
          if (!open) closeInvite()
        }}
      >
        <DialogContent>
          {inviteLink ? (
            <>
              <DialogHeader>
                <DialogTitle>Invite created</DialogTitle>
                <DialogDescription>
                  Send this link to {email}. It works once, expires in seven days, and only works
                  for that email address. We store only a hash, so this is the last time the link
                  can be shown.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-sm border bg-muted px-2.5 py-2 font-mono text-xs">
                  {inviteLink}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void onCopyLink()}
                  aria-label="Copy invite link"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeInvite}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  They will get a link that adds them to this organization with the role you choose.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    className="mt-1.5"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="invite-role">Role</Label>
                  <Select
                    value={role}
                    onValueChange={(next) => {
                      setRole(next as 'admin' | 'member' | 'viewer')
                    }}
                  >
                    <SelectTrigger id="invite-role" className="mt-1.5 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['admin', 'member', 'viewer'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {value} - {ROLE_HELP[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    An invite cannot grant ownership. An existing owner transfers that explicitly.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInvite}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void onInvite()}
                  disabled={email.trim().length === 0 || createInvite.isPending}
                >
                  {createInvite.isPending ? 'Creating' : 'Create invite'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
