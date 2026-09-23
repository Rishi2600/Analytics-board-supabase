import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { ExportsTable } from '@/features/analytics/exports-table'
import { NewExportCard } from '@/features/analytics/new-export-card'
import { useProject } from '@/features/projects/api'

export function ReportsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const range = useMemo(() => presetById(preset).build(), [preset])
  const project = useProject(projectId)

  return (
    <>
      <PageHeader title="Reports" actions={<DateRangePicker value={preset} onChange={setPreset} />}>
        <Provenance
          projectId={projectId}
          timeZone={project.data?.timezone ?? 'Etc/UTC'}
          range={range}
          showFreshness={false}
        />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <NewExportCard projectId={projectId} range={range} />
        <ExportsTable projectId={projectId} />
      </div>
    </>
  )
}
