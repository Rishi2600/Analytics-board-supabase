import { ScrollText } from 'lucide-react'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRelative } from '@/lib/format'
import { useAuditLog, useOrgMembers } from './members-api'

const ACTION_LABELS: Record<string, string> = {
  'org.created': 'Created the organization',
  'api_key.created': 'Created an API key',
  'api_key.revoked': 'Revoked an API key',
  'member.invited': 'Invited a member',
  'member.invite_accepted': 'Accepted an invite',
  'member.role_changed': 'Changed a role',
  'project.retention_changed': 'Changed data retention',
  'export.downloaded': 'Downloaded an export',
  'retention.pruned': 'Pruned old raw events',
}

export function AuditLogPanel({ orgId }: { orgId: string }) {
  const entries = useAuditLog(orgId)
  const members = useOrgMembers(orgId)

  const emailFor = (userId: string | null) =>
    userId ? (members.data?.find((m) => m.user_id === userId)?.email ?? 'A removed user') : 'System'

  return (
    <DataCard
      title="Audit log"
      description="Who changed keys, people and data settings, and when."
      footer="The audit log is append only. Nobody, at any role, can edit or delete an entry."
    >
      {entries.isPending ? (
        <TableSkeleton rows={6} columns={3} />
      ) : entries.isError ? (
        <ErrorState
          title="The audit log did not load"
          description="The entries themselves are intact; this is a read that failed. Try again."
          error={entries.error}
          onRetry={() => void entries.refetch()}
        />
      ) : entries.data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nothing recorded yet"
          description="Key creation and revocation, invites, role changes and retention changes appear here as they happen."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">What happened</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="pr-4">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.data.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="pl-4 font-medium">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </TableCell>
                <TableCell className="wrap-anywhere whitespace-normal text-muted-foreground">
                  {emailFor(entry.actor_user_id)}
                </TableCell>
                <TableCell className="max-w-xs font-mono text-xs wrap-anywhere whitespace-normal text-muted-foreground">
                  {summarise(entry.metadata)}
                </TableCell>
                <TableCell className="pr-4 text-muted-foreground">
                  {formatRelative(entry.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DataCard>
  )
}

function summarise(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata ?? {})
  if (entries.length === 0) return '-'
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ')
}
