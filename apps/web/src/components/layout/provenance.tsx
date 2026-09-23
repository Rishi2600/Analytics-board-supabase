import { CalendarRange, Clock, Globe, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useRollupStatus } from '@/features/analytics/api'
import type { DateRange } from '@/features/analytics/date-range'
import { formatDuration, formatRelative } from '@/lib/format'
import { formatInProjectZone, timeZoneLabel } from '@/lib/tz'

/** Rollups run every five minutes. Past three missed runs, the numbers are stale. */
const STALE_AFTER_SECONDS = 15 * 60

interface Props {
  projectId: string
  timeZone: string
  range?: DateRange
  /** Screens that read raw events, such as Live, do not depend on rollups. */
  showFreshness?: boolean
}

/**
 * The line under a page title that says where its numbers come from: the timezone they are
 * cut in, the range they cover, and how fresh the aggregates behind them are.
 */
export function Provenance({ projectId, timeZone, range, showFreshness = true }: Props) {
  return (
    <ul
      aria-label="About these numbers"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <Fact icon={<Globe />}>{timeZoneLabel(timeZone)}</Fact>
      {range ? (
        <Fact icon={<CalendarRange />}>
          {formatInProjectZone(range.from, timeZone, 'd MMM')} –{' '}
          {formatInProjectZone(range.to, timeZone, 'd MMM')}
        </Fact>
      ) : null}
      {showFreshness ? <Freshness projectId={projectId} /> : null}
    </ul>
  )
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      <span className="tabular">{children}</span>
    </li>
  )
}

function Freshness({ projectId }: { projectId: string }) {
  const status = useRollupStatus(projectId)
  if (status.isPending) return null

  if (status.isError) {
    return <Fact icon={<Clock />}>Freshness unknown</Fact>
  }

  const lag = status.data?.lag_seconds ?? null
  if (lag === null) {
    return <Fact icon={<TriangleAlert className="text-warn" />}>Aggregates not built yet</Fact>
  }

  if (lag > STALE_AFTER_SECONDS) {
    return (
      <Fact icon={<TriangleAlert className="text-warn" />}>
        <Link
          to={`/p/${projectId}/health`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Aggregates {formatDuration(lag * 1000)} behind
        </Link>
      </Fact>
    )
  }

  return <Fact icon={<Clock />}>Updated {formatRelative(status.data?.watermark)}</Fact>
}
