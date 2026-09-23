import { Download, FileDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataCard } from '@/components/data/data-card'
import { StatusBadge, type StatusTone } from '@/components/data/status-badge'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { errorMessage } from '@/lib/errors'
import { formatInteger, formatRelative } from '@/lib/format'
import { EXPORT_KIND_LABELS, EXPORT_STATUS_LABELS, labelFor } from '@/lib/labels'
import { requestExportDownload, useExports, type ExportRecord } from './exports'

const STATUS_TONE: Record<ExportRecord['status'], StatusTone> = {
  queued: 'neutral',
  running: 'busy',
  done: 'ok',
  failed: 'danger',
}

export function ExportsTable({ projectId }: { projectId: string }) {
  const exports = useExports(projectId)
  const [downloading, setDownloading] = useState<string | null>(null)

  const onDownload = async (exportId: string) => {
    setDownloading(exportId)
    try {
      const url = await requestExportDownload(exportId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <DataCard title="Recent exports">
      {exports.isPending ? (
        <TableSkeleton rows={4} columns={4} />
      ) : exports.isError ? (
        <ErrorState
          title="The export list did not load"
          description="Exports already running are unaffected; this is a read that failed. Try again."
          error={exports.error}
          onRetry={() => void exports.refetch()}
        />
      ) : exports.data.length === 0 ? (
        <EmptyState
          icon={FileDown}
          title="No exports yet"
          description="Create one above. It runs in the background, so you can leave this page while it does."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">What</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="border-l text-right">Rows</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="pr-4">
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exports.data.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="pl-4 font-medium">
                  {labelFor(EXPORT_KIND_LABELS, record.kind)}{' '}
                  <span className="font-normal text-muted-foreground">
                    {record.format.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <StatusBadge tone={STATUS_TONE[record.status]}>
                    {labelFor(EXPORT_STATUS_LABELS, record.status)}
                  </StatusBadge>
                  {record.error ? (
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">{record.error}</p>
                  ) : null}
                </TableCell>
                <TableCell className="value border-l text-right">
                  {record.row_count === null ? '-' : formatInteger(record.row_count)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelative(record.created_at)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {record.status === 'done' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloading === record.id}
                      onClick={() => void onDownload(record.id)}
                    >
                      {downloading === record.id ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      Download
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DataCard>
  )
}
