import {
  Activity,
  ChartSpline,
  FileDown,
  Funnel,
  LayoutGrid,
  Radio,
  Repeat,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Path segment under /p/:projectId */
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the command palette as a hint about what the screen answers. */
  hint: string
}

export const ANALYSIS_ITEMS: NavItem[] = [
  { to: 'overview', label: 'Overview', icon: LayoutGrid, hint: 'Headline numbers and trend' },
  { to: 'events', label: 'Events', icon: ChartSpline, hint: 'Filter and break down events' },
  { to: 'live', label: 'Live', icon: Radio, hint: 'Events arriving right now' },
  { to: 'funnels', label: 'Funnels', icon: Funnel, hint: 'Step by step conversion' },
  { to: 'retention', label: 'Retention', icon: Repeat, hint: 'Who comes back, and when' },
]

export const PROJECT_ITEMS: NavItem[] = [
  { to: 'reports', label: 'Reports', icon: FileDown, hint: 'Export data as CSV or JSON' },
  {
    to: 'health',
    label: 'Ingestion health',
    icon: Activity,
    hint: 'Accepted, rejected, rollup lag',
  },
  { to: 'settings', label: 'Settings', icon: Settings, hint: 'Project, keys, members, audit log' },
]

export const NAV_ITEMS: NavItem[] = [...ANALYSIS_ITEMS, ...PROJECT_ITEMS]
