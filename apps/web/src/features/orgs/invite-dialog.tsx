import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage } from '@/lib/errors'
import { ROLE_HELP, ROLE_LABELS } from '@/lib/labels'
import { useCreateInvite } from './members-api'

type InviteRole = 'admin' | 'member' | 'viewer'

interface Props {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteDialog({ orgId, open, onOpenChange }: Props) {
  const createInvite = useCreateInvite(orgId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [emailMissing, setEmailMissing] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const close = () => {
    onOpenChange(false)
    setEmail('')
    setRole('member')
    setEmailMissing(false)
    setLink(null)
    setCopied(false)
  }

  const onInvite = async () => {
    if (!email.trim().includes('@')) {
      setEmailMissing(true)
      return
    }
    try {
      const created = await createInvite.mutateAsync({ email: email.trim(), role })
      setLink(`${window.location.origin}/invite/${created.token}`)
      toast.success('Invite created')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Invite link copied')
    } catch {
      toast.error('The clipboard is not available here. Select the link and copy it by hand.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite created</DialogTitle>
              <DialogDescription>
                Send this link to {email}. It works once, for that address only, and expires in
                seven days. We store only a hash, so this is the last time it can be shown.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-md border bg-muted px-2.5 py-2 font-mono text-xs wrap-anywhere">
                {link}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void onCopy()}
                aria-label="Copy invite link"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void onInvite()
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                They get a link that adds them to this organization with the role you choose.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={emailMissing || undefined}>
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  placeholder="colleague@company.com"
                  aria-invalid={emailMissing || undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setEmailMissing(false)
                  }}
                />
                {emailMissing ? <FieldError>Enter the email address to invite</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                <Select
                  value={role}
                  onValueChange={(next) => {
                    setRole(next as InviteRole)
                  }}
                >
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(['admin', 'member', 'viewer'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {ROLE_HELP[role]}. An invite cannot grant ownership; an owner transfers that
                  directly.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? <Spinner data-icon="inline-start" /> : null}
                {createInvite.isPending ? 'Creating invite' : 'Create invite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
