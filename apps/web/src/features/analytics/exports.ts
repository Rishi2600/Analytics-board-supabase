import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'

export interface ExportRecord {
  id: string
  kind: 'events' | 'timeseries' | 'breakdown'
  format: 'csv' | 'json'
  status: 'queued' | 'running' | 'done' | 'failed'
  params: Record<string, unknown>
  row_count: number | null
  error: string | null
  created_at: string
  finished_at: string | null
}

export function useExports(projectId: string) {
  return useQuery({
    queryKey: queryKeys.exports(projectId),
    queryFn: async (): Promise<ExportRecord[]> => {
      const { data, error } = await supabase
        .from('exports')
        .select('id, kind, format, status, params, row_count, error, created_at, finished_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as ExportRecord[]
    },
    // An export that is running will finish without anyone clicking anything, so this is
    // one of the few places worth polling.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((e) => e.status === 'queued' || e.status === 'running')
        ? 3000
        : false,
  })
}

export function useCreateExport(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      kind: ExportRecord['kind']
      format: ExportRecord['format']
      from: Date
      to: Date
      /** Breakdown exports only: the property to split by, and optionally one event. */
      prop?: string
      event?: string
    }) => {
      const { data: session } = await supabase.auth.getUser()

      // The row is created first and the work happens afterwards, so the request returns
      // immediately and the user sees it queued rather than watching a spinner.
      const { data, error } = await supabase
        .from('exports')
        .insert({
          project_id: projectId,
          kind: input.kind,
          format: input.format,
          params: {
            from: input.from.toISOString(),
            to: input.to.toISOString(),
            ...(input.prop ? { prop: input.prop } : {}),
            ...(input.event ? { event: input.event } : {}),
          },
          requested_by: session.user?.id,
        })
        .select('id')
        .single()
      if (error) throw error

      const invoked = await supabase.functions.invoke('export-run', {
        body: { export_id: data.id },
      })
      if (invoked.error) throw await readableFunctionError(invoked.error)

      return data.id
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.exports(projectId) })
    },
  })
}

/**
 * Asks the server for a signed URL.
 *
 * The browser never signs this itself: the exports bucket has no storage policies, so the
 * only way to a file is through a server that checks membership and writes an audit entry
 * first. The URL is valid for fifteen minutes.
 */
export async function requestExportDownload(exportId: string): Promise<string> {
  const response = await supabase.functions.invoke<{ url: string }>('export-download', {
    body: { export_id: exportId },
  })
  if (response.error) throw await readableFunctionError(response.error)
  const url = response.data?.url
  if (!url) throw new Error('The server did not return a download link.')
  return url
}

/**
 * supabase-js reports every non-2xx response as "Edge Function returned a non-2xx status
 * code", which hides the message the function wrote for the person on the screen. This
 * reads it back out of the response body.
 */
async function readableFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = (await error.context.json()) as { error?: { message?: string } }
      if (body.error?.message) return new Error(body.error.message)
    } catch {
      // Not JSON. Fall through to the generic message below.
    }
  }
  if (error instanceof FunctionsFetchError) {
    return new Error(
      import.meta.env.DEV
        ? 'Could not reach the export service. Locally, start it with npm run functions.'
        : 'Could not reach the export service. Check your connection and try again.',
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}
