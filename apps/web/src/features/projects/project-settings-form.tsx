import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/data/confirm-dialog'
import { DataCard } from '@/components/data/data-card'
import { TimezonePicker } from '@/components/data/timezone-picker'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { timeZoneOffsetLabel } from '@/lib/tz'
import { useUpdateProject, type Project } from './api'

export function ProjectSettingsForm({ project }: { project: Project }) {
  const update = useUpdateProject(project.id)
  const [name, setName] = useState(project.name)
  const [timezone, setTimezone] = useState(project.timezone)
  const [retentionDays, setRetentionDays] = useState(String(project.retention_days))
  const [origins, setOrigins] = useState(project.allowed_origins.join('\n'))
  const [filterBots, setFilterBots] = useState(project.filter_bots)
  const [confirmingRetention, setConfirmingRetention] = useState(false)
  // Errors appear after the first save attempt, not while someone is still typing.
  const [submitted, setSubmitted] = useState(false)

  const retention = Number(retentionDays)
  const retentionOk = Number.isInteger(retention) && retention >= 1 && retention <= 3650
  const nameOk = name.trim().length > 0
  const retentionInvalid = submitted && !retentionOk
  const nameInvalid = submitted && !nameOk
  const lowersRetention = retentionOk && retention < project.retention_days

  const save = async () => {
    try {
      await update.mutateAsync({
        name: name.trim(),
        timezone,
        retention_days: retention,
        allowed_origins: origins
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        filter_bots: filterBots,
      })
      toast.success('Changes saved')
      setConfirmingRetention(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onSubmit = () => {
    setSubmitted(true)
    if (!nameOk || !retentionOk) return
    if (lowersRetention) setConfirmingRetention(true)
    else void save()
  }

  return (
    <DataCard title="Project" description="How this project collects and reports its events.">
      <form
        className="flex max-w-xl flex-col gap-6 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={nameInvalid || undefined}>
            <FieldLabel htmlFor="project-name">Name</FieldLabel>
            <Input
              id="project-name"
              aria-invalid={nameInvalid || undefined}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
            />
            {nameInvalid ? <FieldError>Give the project a name</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="project-timezone">Reporting timezone</FieldLabel>
            <TimezonePicker
              id="project-timezone"
              value={timezone}
              onChange={setTimezone}
              aria-describedby="project-timezone-help"
            />
            <FieldDescription id="project-timezone-help">
              Currently {timeZoneOffsetLabel(timezone)}. Days and weeks are cut in this timezone
              when you read them, so changing it recalculates history rather than rewriting it.
            </FieldDescription>
          </Field>

          <Field data-invalid={retentionInvalid || undefined}>
            <FieldLabel htmlFor="project-retention">Keep raw events for, in days</FieldLabel>
            <Input
              id="project-retention"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              className="sm:w-40"
              aria-invalid={retentionInvalid || undefined}
              value={retentionDays}
              onChange={(e) => {
                setRetentionDays(e.target.value)
              }}
            />
            {retentionInvalid ? (
              <FieldError>Use a whole number of days between 1 and 3,650</FieldError>
            ) : (
              <FieldDescription>
                Aggregated history is kept forever. This controls only the raw events behind it,
                which power Live, Funnels, Retention and exports.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="project-origins">Allowed origins</FieldLabel>
            <Textarea
              id="project-origins"
              rows={4}
              className="font-mono text-xs"
              placeholder={'https://example.com\nhttps://app.example.com'}
              value={origins}
              onChange={(e) => {
                setOrigins(e.target.value)
              }}
            />
            <FieldDescription>
              One per line. Public keys are refused from any origin not listed. Empty means no
              browser can send events.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="project-bots">Filter bot traffic</FieldLabel>
              <FieldDescription>
                Drops events from known crawlers and monitoring tools. Turn off if crawler traffic
                matters to you, for example on a documentation site.
              </FieldDescription>
            </FieldContent>
            <Switch id="project-bots" checked={filterBots} onCheckedChange={setFilterBots} />
          </Field>
        </FieldGroup>

        <div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            {update.isPending ? 'Saving changes' : 'Save changes'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmingRetention}
        onOpenChange={setConfirmingRetention}
        title={`Keep raw events for ${String(retention)} days?`}
        description={`Raw events older than ${String(retention)} days are deleted on the next nightly run, and that cannot be undone. Charts keep their history. Live, Funnels, Retention and exports will not reach back past ${String(retention)} days.`}
        confirmLabel="Save and delete older events"
        pendingLabel="Saving changes"
        pending={update.isPending}
        onConfirm={() => void save()}
      />
    </DataCard>
  )
}
