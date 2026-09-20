import { Activity, FileDown, Filter, Gauge, LayoutGrid, Radio, Settings, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Path segment under /p/:projectId */
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the command palette as a hint about what the screen answers. */
  hint: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: 'overview', label: 'Overview', icon: LayoutGrid, hint: 'Headline numbers and trend' },
  { to: 'events', label: 'Events', icon: Filter, hint: 'Filter and break down events' },
  { to: 'live', label: 'Live', icon: Radio, hint: 'Events arriving right now' },
  { to: 'funnels', label: 'Funnels', icon: Gauge, hint: 'Step by step conversion' },
  { to: 'retention', label: 'Retention', icon: Users, hint: 'Who comes back, and when' },
  { to: 'reports', label: 'Reports', icon: FileDown, hint: 'Export data as CSV or JSON' },
  {
    to: 'health',
    label: 'Ingestion health',
    icon: Activity,
    hint: 'Accepted, rejected, rollup lag',
  },
  { to: 'settings', label: 'Settings', icon: Settings, hint: 'Project, keys, members, audit log' },
]
