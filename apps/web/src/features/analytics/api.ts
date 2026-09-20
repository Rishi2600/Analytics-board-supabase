import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/lib/supabase'
import { rangeKey, staleTimeFor, type DateRange } from './date-range'

/**
 * Every analytics read in the product.
 *
 * All of them call a SQL function in the api schema. None of them builds a query. That is
 * what keeps the resolution rules, the timezone conversion and the tenancy checks in one
 * place instead of drifting across screens.
 */

export interface Summary {
  total_events: number
  unique_users: number
  sessions: number
  events_per_user: number
  prev_total_events: number
  prev_unique_users: number
  prev_sessions: number
  prev_events_per_user: number
  timezone: string
}

export function useSummary(projectId: string, range: DateRange) {
  return useQuery({
    queryKey: queryKeys.summary(projectId, rangeKey(range)),
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await api.rpc('summary', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      const row = data[0]
      if (!row) throw new Error('The summary query returned nothing at all.')
      return {
        ...row,
        total_events: Number(row.total_events),
        unique_users: Number(row.unique_users),
        sessions: Number(row.sessions),
        events_per_user: Number(row.events_per_user),
        prev_total_events: Number(row.prev_total_events),
        prev_unique_users: Number(row.prev_unique_users),
        prev_sessions: Number(row.prev_sessions),
        prev_events_per_user: Number(row.prev_events_per_user),
      }
    },
  })
}

export interface TimeseriesPoint {
  bucket: string
  event_name: string
  event_count: number
  resolution: string
}

export function useTimeseries(
  projectId: string,
  range: DateRange,
  options: { events?: string[]; filterKey?: string; filterValue?: string } = {},
) {
  const params = { ...options, range: rangeKey(range) }
  return useQuery({
    queryKey: queryKeys.timeseries(projectId, params),
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<TimeseriesPoint[]> => {
      const { data, error } = await api.rpc('timeseries', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_events: options.events && options.events.length > 0 ? options.events : undefined,
        p_filters:
          options.filterKey && options.filterValue
            ? { key: options.filterKey, value: options.filterValue }
            : {},
      })
      if (error) throw error
      return data.map((row) => ({ ...row, event_count: Number(row.event_count) }))
    },
  })
}

export interface TopEvent {
  event_name: string
  event_count: number
  share: number
}

export function useTopEvents(projectId: string, range: DateRange, limit = 10) {
  return useQuery({
    queryKey: queryKeys.topEvents(projectId, { range: rangeKey(range), limit }),
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<TopEvent[]> => {
      const { data, error } = await api.rpc('top_events', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_limit: limit,
      })
      if (error) throw error
      return data.map((row) => ({
        ...row,
        event_count: Number(row.event_count),
        share: Number(row.share),
      }))
    },
  })
}

export interface BreakdownRow {
  prop_value: string
  event_count: number
  share: number
}

export function useBreakdown(
  projectId: string,
  range: DateRange,
  event: string | null,
  prop: string | null,
  limit = 20,
) {
  return useQuery({
    queryKey: queryKeys.breakdown(projectId, { range: rangeKey(range), event, prop, limit }),
    enabled: Boolean(prop),
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<BreakdownRow[]> => {
      const { data, error } = await api.rpc('breakdown', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_event: event ?? undefined,
        p_prop: prop ?? '',
        p_limit: limit,
      })
      if (error) throw error
      return data.map((row) => ({
        ...row,
        event_count: Number(row.event_count),
        share: Number(row.share),
      }))
    },
  })
}

export function useEventNames(projectId: string) {
  return useQuery({
    queryKey: queryKeys.eventNames(projectId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ event_name: string; event_count: number }[]> => {
      const { data, error } = await api.rpc('event_names', { p_project: projectId })
      if (error) throw error
      return data.map((row) => ({ ...row, event_count: Number(row.event_count) }))
    },
  })
}

export function usePropertyKeys(projectId: string) {
  return useQuery({
    queryKey: queryKeys.indexedProperties(projectId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ prop_key: string; enabled: boolean }[]> => {
      const { data, error } = await api.rpc('property_keys', { p_project: projectId })
      if (error) throw error
      return data
    },
  })
}

export interface FunnelStep {
  step_index: number
  event_name: string
  users: number
  conversion_from_first: number
  conversion_from_previous: number
}

export function useFunnel(
  projectId: string,
  steps: string[],
  windowHours: number,
  range: DateRange,
) {
  return useQuery({
    queryKey: queryKeys.funnel(projectId, { steps, windowHours, range: rangeKey(range) }),
    enabled: steps.length >= 2,
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<FunnelStep[]> => {
      const { data, error } = await api.rpc('funnel', {
        p_project: projectId,
        p_steps: steps,
        p_window: `${String(windowHours)} hours`,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      return data.map((row) => ({
        ...row,
        users: Number(row.users),
        conversion_from_first: Number(row.conversion_from_first),
        conversion_from_previous: Number(row.conversion_from_previous),
      }))
    },
  })
}

export interface RetentionCell {
  cohort_start: string
  cohort_size: number
  period_number: number
  returned: number
  rate: number
}

export function useRetention(
  projectId: string,
  cohortEvent: string,
  returnEvent: string,
  periods: number,
  period: 'week' | 'month',
  range: DateRange,
) {
  return useQuery({
    queryKey: queryKeys.retention(projectId, {
      cohortEvent,
      returnEvent,
      periods,
      period,
      range: rangeKey(range),
    }),
    enabled: Boolean(cohortEvent && returnEvent),
    staleTime: staleTimeFor(range),
    queryFn: async (): Promise<RetentionCell[]> => {
      const { data, error } = await api.rpc('retention', {
        p_project: projectId,
        p_cohort_event: cohortEvent,
        p_return_event: returnEvent,
        p_periods: periods,
        p_period: period,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      return data.map((row) => ({
        ...row,
        cohort_size: Number(row.cohort_size),
        returned: Number(row.returned),
        rate: Number(row.rate),
      }))
    },
  })
}

export interface LiveEvent {
  id: string
  event_name: string
  distinct_id: string
  session_id: string | null
  ts: string
  received_at: string
  properties: Record<string, unknown>
  context: Record<string, unknown>
}

export function useLiveEvents(projectId: string, limit = 100, enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveEvents(projectId),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<LiveEvent[]> => {
      const { data, error } = await api.rpc('live_events', {
        p_project: projectId,
        p_limit: limit,
      })
      if (error) throw error
      return data as LiveEvent[]
    },
  })
}

export interface HealthPoint {
  bucket: string
  accepted: number
  rejected: number
}

export function useIngestionHealth(projectId: string, range: DateRange) {
  return useQuery({
    queryKey: queryKeys.ingestionHealth(projectId, rangeKey(range)),
    staleTime: 30_000,
    queryFn: async (): Promise<HealthPoint[]> => {
      const { data, error } = await api.rpc('ingestion_health', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      return data.map((row) => ({
        ...row,
        accepted: Number(row.accepted),
        rejected: Number(row.rejected),
      }))
    },
  })
}

export function useRejectionReasons(projectId: string, range: DateRange) {
  return useQuery({
    queryKey: [...queryKeys.ingestionHealth(projectId, rangeKey(range)), 'reasons'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await api.rpc('rejection_reasons', {
        p_project: projectId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      if (error) throw error
      return data.map((row) => ({ ...row, total: Number(row.total) }))
    },
  })
}

export function useRollupStatus(projectId: string) {
  return useQuery({
    queryKey: [...queryKeys.project(projectId), 'rollup-status'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await api.rpc('rollup_status', { p_project: projectId })
      if (error) throw error
      return data[0] ?? null
    },
  })
}
