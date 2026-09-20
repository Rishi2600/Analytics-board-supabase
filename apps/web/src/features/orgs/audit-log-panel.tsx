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
    <section>
      <div className="border-b px-6 py-3">
        <h2 className="text-sm font-medium">Audit log</h2>
      </div>

      {entries.isPending ? (
        <TableSkeleton rows={6} columns={3} />
      ) : entries.isError ? (
        <ErrorState
          title="We could not load the audit log"
          description="The entries themselves are intact. This is a read that failed."
          error={entries.error}
          onRetry={() => void entries.refetch()}
        />
      ) : entries.data.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Key creation, revocation, invites, role changes and retention changes appear here as they happen."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>What happened</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.data.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {emailFor(entry.actor_user_id)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {summarise(entry.metadata)}
                </TableCell>
                <TableCell className="border-l text-xs text-muted-foreground">
                  {formatRelative(entry.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="border-t px-6 py-3 text-xs text-muted-foreground">
        The audit log is append only. Nobody, at any role, can edit or delete an entry from the
        dashboard.
      </p>
    </section>
  )
}

function summarise(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata ?? {})
  if (entries.length === 0) return '-'
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ')
}
