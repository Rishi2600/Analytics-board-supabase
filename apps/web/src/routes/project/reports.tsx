import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  requestExportDownload,
  useCreateExport,
  useExports,
  type ExportRecord,
} from '@/features/analytics/exports'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { errorMessage } from '@/lib/errors'
import { formatInteger, formatRelative } from '@/lib/format'

const ROW_CAP = 100_000

const STATUS_VARIANT: Record<
  ExportRecord['status'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  queued: 'outline',
  running: 'secondary',
  done: 'default',
  failed: 'destructive',
}

export function ReportsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [kind, setKind] = useState<ExportRecord['kind']>('events')
  const [format, setFormat] = useState<ExportRecord['format']>('csv')

  const range = useMemo(() => presetById(preset).build(), [preset])
  const exports = useExports(projectId)
  const createExport = useCreateExport(projectId)

  const onCreate = async () => {
    try {
      await createExport.mutateAsync({ kind, format, from: range.from, to: range.to })
      toast.success('Export started')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onDownload = async (exportId: string) => {
    try {
      const url = await requestExportDownload(exportId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      />

      <div className="space-y-6 p-6">
        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">New export</h2>
          </div>

          <div className="flex flex-wrap items-end gap-4 p-4">
            <div className="min-w-48">
              <Label htmlFor="export-kind" className="text-xs">
                What to export
              </Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as ExportRecord['kind'])
                }}
              >
                <SelectTrigger id="export-kind" className="mt-1.5 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="events">Raw events</SelectItem>
                  <SelectItem value="timeseries">Events over time</SelectItem>
                  <SelectItem value="breakdown">Property breakdown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-32">
              <Label htmlFor="export-format" className="text-xs">
                Format
              </Label>
              <Select
                value={format}
                onValueChange={(value) => {
                  setFormat(value as ExportRecord['format'])
                }}
              >
                <SelectTrigger id="export-format" className="mt-1.5 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" onClick={() => void onCreate()} disabled={createExport.isPending}>
              {createExport.isPending ? 'Starting' : 'Create export'}
            </Button>
          </div>

          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Exports are capped at {formatInteger(ROW_CAP)} rows. If your range has more than that,
            narrow the dates and run it in parts. Files are deleted after 30 days; the record of who
            exported what is kept.
          </p>
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Recent exports</h2>
          </div>

          {exports.isPending ? (
            <TableSkeleton rows={4} columns={4} />
          ) : exports.isError ? (
            <ErrorState
              title="The export list did not load"
              description="Any export already running is unaffected; this is a read that failed."
              error={exports.error}
              onRetry={() => void exports.refetch()}
            />
          ) : exports.data.length === 0 ? (
            <EmptyState
              title="No exports yet"
              description="Create one above. It runs in the background, so you can leave this page."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.data.map((record) => (
                  <TableRow key={record.id} className="group">
                    <TableCell className="font-medium">
                      {record.kind} <span className="text-muted-foreground">({record.format})</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                      {record.error ? (
                        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                          {record.error}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="value border-l text-right text-sm">
                      {record.row_count === null ? '-' : formatInteger(record.row_count)}
                    </TableCell>
                    <TableCell className="border-l text-xs text-muted-foreground">
                      {formatRelative(record.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.status === 'done' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => void onDownload(record.id)}
                        >
                          <Download size={16} /> Download
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </>
  )
}
