import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useApiKeys, useRevokeApiKey, type ApiKey } from './api'
import { CreateKeyDialog } from './create-key-dialog'

export function KeysTable({ projectId }: { projectId: string }) {
  const keys = useApiKeys(projectId)
  const revoke = useRevokeApiKey(projectId)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<ApiKey | null>(null)

  const onRevoke = async () => {
    if (!confirming) return
    try {
      await revoke.mutateAsync(confirming.id)
      toast.success('Key revoked')
      setConfirming(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h2 className="text-sm font-medium">API keys</h2>
        <Button
          size="sm"
          onClick={() => {
            setCreating(true)
          }}
        >
          Create key
        </Button>
      </div>

      {keys.isPending ? (
        <TableSkeleton rows={3} columns={4} />
      ) : keys.isError ? (
        <ErrorState
          title="We could not load your keys"
          description="The key list failed to load. Your existing keys are unaffected and still work."
          error={keys.error}
          onRetry={() => void keys.refetch()}
        />
      ) : keys.data.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description="A key lets your app send events to us. Create a public key for browser code, or a secret key for your servers."
          action={
            <Button
              size="sm"
              onClick={() => {
                setCreating(true)
              }}
            >
              Create key
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.data.map((key) => (
              <TableRow key={key.id} className="group">
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="value border-l text-xs text-muted-foreground">
                  {key.key_prefix}
                </TableCell>
                <TableCell>
                  <Badge variant={key.key_type === 'secret' ? 'secondary' : 'outline'}>
                    {key.key_type === 'secret' ? 'Secret' : 'Public'}
                  </Badge>
                </TableCell>
                <TableCell className="border-l text-xs text-muted-foreground">
                  {key.revoked_at ? 'Revoked' : formatRelative(key.last_used_at)}
                </TableCell>
                <TableCell className="text-right">
                  {key.revoked_at ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      // Revealed on hover and on keyboard focus. A control that only
                      // appears on hover is unreachable by keyboard, which is a bug.
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => {
                        setConfirming(key)
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="border-t px-6 py-3 text-xs text-muted-foreground">
        A key is shown once, when you create it. We store only a hash, so we cannot show it again.
        Revoking keeps the record and stops the key working.
      </p>

      <CreateKeyDialog projectId={projectId} open={creating} onOpenChange={setCreating} />

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {confirming?.name}?</DialogTitle>
            <DialogDescription>
              Any app using this key stops sending events immediately. Events already received are
              kept. This cannot be undone, so create the replacement key first if something is live.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void onRevoke()}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? 'Revoking' : 'Revoke key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
