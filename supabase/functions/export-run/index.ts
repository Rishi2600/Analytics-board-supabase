import { serviceClient } from '../_shared/auth.ts'
import { logRequest } from '../_shared/log.ts'
import { ERROR_CODES, errorResponse, jsonResponse } from '../_shared/responses.ts'

/**
 * The export worker.
 *
 * POST /functions/v1/export-run  { "export_id": "..." }
 *
 * The dashboard inserts a row in exports and calls this. The row already exists and is
 * already visible in the interface as "queued", so the user sees their request land
 * immediately rather than watching a spinner while a hundred thousand rows are assembled.
 *
 * This runs under the service role and therefore bypasses row level security, so the only
 * thing it trusts from the caller is an export id. Everything else, including which project
 * the data comes from, is read from the row we already stored.
 */

const ROW_CAP = 100_000
const PAGE_SIZE = 5_000

interface ExportRow {
  id: string
  project_id: string
  kind: string
  format: string
  params: Record<string, unknown>
}

Deno.serve(async (request: Request): Promise<Response> => {
  const startedAt = performance.now()

  if (request.method !== 'POST') {
    return errorResponse(ERROR_CODES.methodNotAllowed, 'This endpoint accepts POST.', 405)
  }

  let exportId: string | undefined
  const client = serviceClient()

  try {
    const body = (await request.json()) as { export_id?: string }
    exportId = body.export_id
    if (!exportId) {
      return errorResponse(ERROR_CODES.invalidRequest, 'Send { "export_id": "..." }.', 400)
    }

    // Claiming flips queued to running in one statement, so two concurrent invocations
    // cannot both process the same export.
    const claimed = await client.schema('jobs').rpc('claim_export', { p_export_id: exportId })
    if (claimed.error) throw claimed.error

    const job = (claimed.data as ExportRow[] | null)?.[0]
    if (!job) {
      return errorResponse(
        ERROR_CODES.invalidRequest,
        'That export is not queued. It may already have run.',
        409,
      )
    }

    const from = String(job.params.from ?? new Date(Date.now() - 7 * 86_400_000).toISOString())
    const to = String(job.params.to ?? new Date().toISOString())

    const {
      body: fileBody,
      rowCount,
      extension,
      contentType,
    } = await buildExport(client, job, from, to)

    const path = `${job.project_id}/${job.id}.${extension}`
    const upload = await client.storage
      .from('exports')
      .upload(path, new Blob([fileBody], { type: contentType }), {
        contentType,
        upsert: true,
      })
    if (upload.error) throw upload.error

    const finish = await client.schema('jobs').rpc('finish_export', {
      p_export_id: job.id,
      p_storage_path: path,
      p_row_count: rowCount,
    })
    if (finish.error) throw finish.error

    logRequest({
      fn: 'export-run',
      outcome: 'accepted',
      status: 200,
      duration_ms: performance.now() - startedAt,
      project_id: job.project_id,
      accepted: rowCount,
    })

    return jsonResponse({ export_id: job.id, row_count: rowCount, storage_path: path }, 200)
  } catch (error) {
    // Database errors are plain objects with a message, not Error instances. The message is
    // what the Reports screen shows, so it is stored on its own rather than as JSON.
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error)

    // The row is marked failed with the reason, so the customer sees why on the reports
    // screen instead of an export that sits at "running" forever.
    if (exportId) {
      await client
        .schema('jobs')
        .rpc('fail_export', { p_export_id: exportId, p_error: message.slice(0, 500) })
    }

    logRequest({
      fn: 'export-run',
      outcome: 'error',
      status: 500,
      duration_ms: performance.now() - startedAt,
      error_code: ERROR_CODES.internalError,
      message,
    })

    return errorResponse(
      ERROR_CODES.internalError,
      'The export failed. The reason is recorded against the export.',
      500,
    )
  }
})

interface BuiltExport {
  body: string
  rowCount: number
  extension: string
  contentType: string
}

async function buildExport(
  client: ReturnType<typeof serviceClient>,
  job: ExportRow,
  from: string,
  to: string,
): Promise<BuiltExport> {
  const rows = await fetchRows(client, job, from, to)

  if (job.format === 'json') {
    return {
      body: JSON.stringify(rows),
      rowCount: rows.length,
      extension: 'json',
      contentType: 'application/json',
    }
  }

  return {
    body: toCsv(rows),
    rowCount: rows.length,
    extension: 'csv',
    contentType: 'text/csv',
  }
}

async function fetchRows(
  client: ReturnType<typeof serviceClient>,
  job: ExportRow,
  from: string,
  to: string,
): Promise<Record<string, unknown>[]> {
  if (job.kind === 'events') {
    // Paged rather than fetched in one go: a hundred thousand rows in a single response
    // is a memory spike in a function with a fixed budget.
    const collected: Record<string, unknown>[] = []
    for (let offset = 0; offset < ROW_CAP; offset += PAGE_SIZE) {
      const { data, error } = await client
        .from('events_raw')
        .select('id, event_name, distinct_id, session_id, ts, received_at, properties, context')
        .eq('project_id', job.project_id)
        .gte('ts', from)
        .lt('ts', to)
        .order('ts', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      collected.push(...(data as Record<string, unknown>[]))
      if (data.length < PAGE_SIZE) break
    }
    return collected
  }

  if (job.kind === 'timeseries') {
    const { data, error } = await client.schema('api').rpc('timeseries', {
      p_project: job.project_id,
      p_from: from,
      p_to: to,
    })
    if (error) throw error
    return (data ?? []) as Record<string, unknown>[]
  }

  const { data, error } = await client.schema('api').rpc('breakdown', {
    p_project: job.project_id,
    p_from: from,
    p_to: to,
    p_event: (job.params.event as string | undefined) ?? undefined,
    p_prop: (job.params.prop as string | undefined) ?? undefined,
    p_limit: 200,
  })
  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}

/** RFC 4180: quote every field, double any embedded quote. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0] ?? {})
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','))
  }
  return lines.join('\n')
}
