import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/errors'
import { supportedTimeZones, timeZoneOffsetLabel } from '@/lib/tz'
import { useUpdateProject, type Project } from './api'

export function ProjectSettingsForm({ project }: { project: Project }) {
  const update = useUpdateProject(project.id)
  const [name, setName] = useState(project.name)
  const [timezone, setTimezone] = useState(project.timezone)
  const [retentionDays, setRetentionDays] = useState(String(project.retention_days))
  const [origins, setOrigins] = useState(project.allowed_origins.join('\n'))
  const [filterBots, setFilterBots] = useState(project.filter_bots)

  const retentionDecreasing = Number(retentionDays) < project.retention_days

  const onSave = async () => {
    try {
      await update.mutateAsync({
        name: name.trim(),
        timezone,
        retention_days: Number(retentionDays),
        allowed_origins: origins
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        filter_bots: filterBots,
      })
      toast.success('Project updated')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section>
      <div className="border-b px-6 py-3">
        <h2 className="text-sm font-medium">Project</h2>
      </div>

      <div className="max-w-xl space-y-5 px-6 py-5">
        <div>
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            className="mt-1.5"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
        </div>

        <div>
          <Label htmlFor="project-timezone">Reporting timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="project-timezone" className="mt-1.5 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {supportedTimeZones().map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Currently {timeZoneOffsetLabel(timezone)}. Rollups are stored in UTC and converted when
            you read them, so changing this recalculates history rather than rewriting it.
          </p>
        </div>

        <div>
          <Label htmlFor="project-retention">Raw event retention, in days</Label>
          <Input
            id="project-retention"
            type="number"
            min={1}
            max={3650}
            className="mt-1.5"
            value={retentionDays}
            onChange={(e) => {
              setRetentionDays(e.target.value)
            }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Aggregated history is kept forever. This controls only the raw events behind it, which
            power the Live feed and exports.
          </p>
          {retentionDecreasing ? (
            <p className="mt-1.5 text-xs text-warn" role="status">
              Lowering this deletes raw events older than {retentionDays} days on the next nightly
              run. Charts keep their history; exports of that period will not.
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="project-origins">Allowed origins</Label>
          <textarea
            id="project-origins"
            rows={4}
            className="mt-1.5 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
            placeholder={'https://example.com\nhttps://app.example.com'}
            value={origins}
            onChange={(e) => {
              setOrigins(e.target.value)
            }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            One per line. Browser keys are refused from any origin not listed here. Empty means no
            browser origin is allowed.
          </p>
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="project-bots">Filter bot traffic</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Drops events from known crawlers and monitoring tools. Turn this off if you are
              measuring a documentation site where crawler traffic matters.
            </p>
          </div>
          <Switch id="project-bots" checked={filterBots} onCheckedChange={setFilterBots} />
        </div>

        <Button onClick={() => void onSave()} disabled={update.isPending}>
          {update.isPending ? 'Saving' : 'Save changes'}
        </Button>
      </div>
    </section>
  )
}
