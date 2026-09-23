import { createClient } from 'npm:@supabase/supabase-js@2.58.0'
import { serviceClient } from '../_shared/auth.ts'
import { logRequest } from '../_shared/log.ts'
import { ERROR_CODES, errorResponse, jsonResponse } from '../_shared/responses.ts'

/**
 * Issues a signed URL for a finished export.
 *
 * Signing happens here rather than in the browser because the exports bucket has no
 * storage policies at all. That is deliberate: a policy would be a second path to the same
 * files, and it would be a quiet one, because policy-based reads are not audited.
 *
 * The authorization check is not reimplemented here. The caller's own token is used to
 * call api.record_export_download(), which enforces project membership through the same
 * rules as everything else and writes the audit entry. Only once that succeeds does the
 * service role sign anything.
 */

const SIGNED_URL_SECONDS = 15 * 60

Deno.serve(async (request: Request): Promise<Response> => {
  const startedAt = performance.now()

  if (request.method !== 'POST') {
    return errorResponse(ERROR_CODES.methodNotAllowed, 'This endpoint accepts POST.', 405)
  }

  try {
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return errorResponse(ERROR_CODES.unauthorized, 'Sign in to download an export.', 401)
    }

    const { export_id: exportId } = (await request.json()) as { export_id?: string }
    if (!exportId) {
      return errorResponse(ERROR_CODES.invalidRequest, 'Send { "export_id": "..." }.', 400)
    }

    // As the caller, not as the service role. If they cannot see this export, this fails
    // and nothing is signed.
    const asCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    )

    const audited = await asCaller.schema('api').rpc('record_export_download', {
      p_export_id: exportId,
    })
    if (audited.error) {
      return errorResponse(
        ERROR_CODES.unauthorized,
        'That export does not exist, or you do not have access to it.',
        403,
      )
    }

    const service = serviceClient()
    const { data: exportRow, error: readError } = await service
      .from('exports')
      .select('storage_path, status')
      .eq('id', exportId)
      .single()
    if (readError) throw readError

    if (exportRow.status !== 'done' || !exportRow.storage_path) {
      return errorResponse(
        ERROR_CODES.invalidRequest,
        'This export has no file. It may still be running, or it may have expired after 30 days.',
        409,
      )
    }

    const signed = await service.storage
      .from('exports')
      .createSignedUrl(exportRow.storage_path as string, SIGNED_URL_SECONDS)
    if (signed.error) throw signed.error

    logRequest({
      fn: 'export-download',
      outcome: 'accepted',
      status: 200,
      duration_ms: performance.now() - startedAt,
    })

    return jsonResponse({ url: signed.data.signedUrl, expires_in: SIGNED_URL_SECONDS }, 200)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error)

    logRequest({
      fn: 'export-download',
      outcome: 'error',
      status: 500,
      duration_ms: performance.now() - startedAt,
      error_code: ERROR_CODES.internalError,
      message,
    })

    return errorResponse(
      ERROR_CODES.internalError,
      'Could not prepare the download link. Try again in a minute; the file is kept for 30 days.',
      500,
    )
  }
})
