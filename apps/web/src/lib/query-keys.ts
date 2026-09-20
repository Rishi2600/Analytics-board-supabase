/**
 * Every TanStack Query key in the product, in one file.
 *
 * Scattered inline keys are how cache invalidation quietly stops working: someone writes
 * ['events', projectId] in one place and ['events', projectId, filters] in another, and
 * the invalidation after a mutation misses. Centralising them means a key change is a
 * compile error rather than a stale chart.
 *
 * The project id is the first segment of every project scoped key. That is what makes
 * "invalidate everything for this project" a one line call, and it is the same reason the
 * project id is part of the server side cache key.
 */
export const queryKeys = {
  session: () => ['session'] as const,

  organizations: () => ['organizations'] as const,
  orgMembers: (orgId: string) => ['organizations', orgId, 'members'] as const,
  orgInvites: (orgId: string) => ['organizations', orgId, 'invites'] as const,
  auditLog: (orgId: string) => ['organizations', orgId, 'audit-log'] as const,

  projects: () => ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,

  apiKeys: (projectId: string) => ['projects', projectId, 'api-keys'] as const,
  indexedProperties: (projectId: string) => ['projects', projectId, 'indexed-properties'] as const,
  savedViews: (projectId: string) => ['projects', projectId, 'saved-views'] as const,
  exports: (projectId: string) => ['projects', projectId, 'exports'] as const,

  summary: (projectId: string, params: unknown) =>
    ['projects', projectId, 'summary', params] as const,
  timeseries: (projectId: string, params: unknown) =>
    ['projects', projectId, 'timeseries', params] as const,
  breakdown: (projectId: string, params: unknown) =>
    ['projects', projectId, 'breakdown', params] as const,
  topEvents: (projectId: string, params: unknown) =>
    ['projects', projectId, 'top-events', params] as const,
  funnel: (projectId: string, params: unknown) =>
    ['projects', projectId, 'funnel', params] as const,
  retention: (projectId: string, params: unknown) =>
    ['projects', projectId, 'retention', params] as const,
  liveEvents: (projectId: string) => ['projects', projectId, 'live-events'] as const,
  eventNames: (projectId: string) => ['projects', projectId, 'event-names'] as const,
  ingestionHealth: (projectId: string, params: unknown) =>
    ['projects', projectId, 'ingestion-health', params] as const,
} as const
