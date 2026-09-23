import { useState } from 'react'
import { toast } from 'sonner'
import { DataCard } from '@/components/data/data-card'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
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
import { useEventNames, usePropertyKeys } from './api'
import { useCreateExport, type ExportRecord } from './exports'

const ROW_CAP = 100_000
const ALL_EVENTS = '__all__'

export function NewExportCard({ projectId, range }: { projectId: string; range: DateRange }) {
  const [kind, setKind] = useState<ExportRecord['kind']>('events')
  const [format, setFormat] = useState<ExportRecord['format']>('csv')
  const [prop, setProp] = useState('')
  const [event, setEvent] = useState(ALL_EVENTS)
  const [propMissing, setPropMissing] = useState(false)
  const createExport = useCreateExport(projectId)
  const propertyKeys = usePropertyKeys(projectId)
  const eventNames = useEventNames(projectId)
  const isBreakdown = kind === 'breakdown'

  const onCreate = async () => {
    if (isBreakdown && !prop) {
      setPropMissing(true)
      return
    }
    try {
      await createExport.mutateAsync({
        kind,
        format,
        from: range.from,
        to: range.to,
        ...(isBreakdown ? { prop, event: event === ALL_EVENTS ? undefined : event } : {}),
      })
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
          <OptionSelect
            id="export-kind"
            value={kind}
            onChange={(value) => {
              setKind(value as ExportRecord['kind'])
            }}
            options={Object.entries(EXPORT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>

        {isBreakdown ? (
          <>
            <Field className="sm:w-44" data-invalid={propMissing || undefined}>
              <FieldLabel htmlFor="export-prop">Property</FieldLabel>
              <OptionSelect
                id="export-prop"
                value={prop}
                placeholder="Choose one"
                invalid={propMissing}
                onChange={(value) => {
                  setProp(value)
                  setPropMissing(false)
                }}
                options={(propertyKeys.data ?? []).map((p) => ({
                  value: p.prop_key,
                  label: p.prop_key,
                }))}
              />
              {propMissing ? <FieldError>Choose a property to break down by</FieldError> : null}
            </Field>
            <Field className="sm:w-44">
              <FieldLabel htmlFor="export-event">Event</FieldLabel>
              <OptionSelect
                id="export-event"
                value={event}
                onChange={setEvent}
                options={[
                  { value: ALL_EVENTS, label: 'All events' },
                  ...(eventNames.data ?? []).map((e) => ({
                    value: e.event_name,
                    label: e.event_name,
                  })),
                ]}
              />
            </Field>
          </>
        ) : null}

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

function OptionSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  invalid?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
