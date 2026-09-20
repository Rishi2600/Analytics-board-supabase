/**
 * Every response the ingestion API can produce.
 *
 * Each non-2xx carries a stable machine readable code. Customers write retry logic
 * against these, so they are part of the public contract and changing one is a breaking
 * change. The human readable message is not: it can be reworded freely.
 */

export const ERROR_CODES = {
  invalidRequest: 'invalid_request',
  invalidJson: 'invalid_json',
  payloadTooLarge: 'payload_too_large',
  batchTooLarge: 'batch_too_large',
  unauthorized: 'unauthorized',
  originNotAllowed: 'origin_not_allowed',
  secretKeyFromBrowser: 'secret_key_from_browser',
  rateLimited: 'rate_limited',
  methodNotAllowed: 'method_not_allowed',
  internalError: 'internal_error',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error: { code, message } }, status, headers)
}
