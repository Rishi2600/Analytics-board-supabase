/**
 * CORS for the ingestion endpoint.
 *
 * The rule differs by key type, and that difference is the whole point:
 *
 *   pk_live_  is meant to sit in public browser code. It cannot be kept secret, so what
 *             protects it is the origin allowlist plus the fact that it can only write.
 *
 *   sk_live_  is meant for servers. A server does not send an Origin header. If one
 *             arrives with a secret key, the key is in browser code where it does not
 *             belong, and the right response is to refuse loudly rather than to quietly
 *             accept and let a customer ship a leaked credential to production.
 */

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export function originAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return false
  // A project that opts into "*" has decided its public key is genuinely public. We
  // support it because some customers embed on domains they do not control, but it is
  // never the default: projects.allowed_origins starts empty.
  if (allowedOrigins.includes('*')) return true
  return allowedOrigins.some((allowed) => allowed.trim().toLowerCase() === origin.toLowerCase())
}

/** Headers echoed back on a successful cross-origin request. */
export function corsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  if (!origin) return { ...BASE_HEADERS }
  if (!originAllowed(origin, allowedOrigins)) return { ...BASE_HEADERS }
  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  }
}

/**
 * Preflight is answered before the key is known, because the browser sends OPTIONS without
 * the Authorization header. We therefore allow the preflight and enforce the origin on the
 * actual POST, which is where the key tells us which project's allowlist applies.
 */
export function preflightResponse(origin: string | null): Response {
  const headers: Record<string, string> = { ...BASE_HEADERS }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return new Response(null, { status: 204, headers })
}
