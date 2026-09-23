import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/data/confirm-dialog'
import { DataCard } from '@/components/data/data-card'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  const onRevoke = async () => {
    if (!revoking) return
    try {
      await revoke.mutateAsync(revoking.id)
      toast.success('Key revoked')
      setRevoking(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const createButton = (
    <Button
      onClick={() => {
        setCreating(true)
      }}
    >
      Create key
    </Button>
  )

  return (
    <DataCard
      title="API keys"
      description="Keys let your app send events. Use a public key in browser code and a secret key on your servers."
      action={createButton}
      footer="A key is shown once, when you create it. We store only a hash, so we cannot show it again. Revoking keeps the record and stops the key working."
    >
      {keys.isPending ? (
        <TableSkeleton rows={3} columns={4} />
      ) : keys.isError ? (
        <ErrorState
          title="Your keys did not load"
          description="The list failed to load. Your keys are unaffected and still work. Try again."
          error={keys.error}
          onRetry={() => void keys.refetch()}
        />
      ) : keys.data.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="Create a key so your app can send events to this project."
          action={createButton}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.data.map((key) => (
              <TableRow key={key.id} className="group/row">
                <TableCell className="pl-4 font-medium wrap-anywhere whitespace-normal">
                  {key.name}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {key.key_prefix}
                </TableCell>
                <TableCell>
                  <Badge variant={key.key_type === 'secret' ? 'secondary' : 'outline'}>
                    {key.key_type === 'secret' ? 'Secret' : 'Public'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {key.revoked_at ? (
                    <StatusBadge tone="neutral">Revoked</StatusBadge>
                  ) : key.last_used_at ? (
                    formatRelative(key.last_used_at)
                  ) : (
                    'Never'
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {key.revoked_at ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="row-actions"
                      aria-label={`Revoke ${key.name}`}
                      onClick={() => {
                        setRevoking(key)
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

      <CreateKeyDialog projectId={projectId} open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={`Revoke ${revoking?.name ?? 'this key'}?`}
        description="Any app using this key stops sending events straight away. Events already received are kept. This cannot be undone, so create the replacement key first if something is live."
        confirmLabel="Revoke key"
        pendingLabel="Revoking key"
        pending={revoke.isPending}
        onConfirm={() => void onRevoke()}
      />
    </DataCard>
  )
}
