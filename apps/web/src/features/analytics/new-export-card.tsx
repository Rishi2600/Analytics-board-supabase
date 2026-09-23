import { useState } from 'react'
import { toast } from 'sonner'
import { DataCard } from '@/components/data/data-card'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorMessage } from '@/lib/errors'
import { formatInteger } from '@/lib/format'
import { EXPORT_KIND_LABELS } from '@/lib/labels'
import type { DateRange } from './date-range'
import { useCreateExport, type ExportRecord } from './exports'

const ROW_CAP = 100_000

export function NewExportCard({ projectId, range }: { projectId: string; range: DateRange }) {
  const [kind, setKind] = useState<ExportRecord['kind']>('events')
  const [format, setFormat] = useState<ExportRecord['format']>('csv')
  const createExport = useCreateExport(projectId)

  const onCreate = async () => {
    try {
      await createExport.mutateAsync({ kind, format, from: range.from, to: range.to })
      toast.success('Export created. It appears below when the file is ready.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <DataCard
      title="New export"
      footer={`Exports stop at ${formatInteger(ROW_CAP)} rows; for more, narrow the dates and export in parts. Files are deleted after 30 days, and the record of who downloaded what is kept.`}
    >
      <FieldGroup className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
        <Field className="sm:w-56">
          <FieldLabel htmlFor="export-kind">What to export</FieldLabel>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as ExportRecord['kind'])
            }}
          >
            <SelectTrigger id="export-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(EXPORT_KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-auto">
          <FieldTitle id="export-format-label">Format</FieldTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-labelledby="export-format-label"
            value={format}
            onValueChange={(value) => {
              if (value === 'csv' || value === 'json') setFormat(value)
            }}
          >
            <ToggleGroupItem value="csv">CSV</ToggleGroupItem>
            <ToggleGroupItem value="json">JSON</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Button
          className="sm:ml-auto"
          onClick={() => void onCreate()}
          disabled={createExport.isPending}
        >
          {createExport.isPending ? <Spinner data-icon="inline-start" /> : null}
          {createExport.isPending ? 'Creating export' : 'Create export'}
        </Button>
      </FieldGroup>
    </DataCard>
  )
}
