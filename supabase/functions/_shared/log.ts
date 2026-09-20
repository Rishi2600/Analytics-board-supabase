/**
 * One structured JSON line per request.
 *
 * Structured because these are read by a log search, not by a person scrolling. The fields
 * are fixed so that "show me every 429 for this key today" is a query rather than a grep
 * with a regular expression in it.
 */
export interface RequestLog {
  fn: string
  outcome: 'accepted' | 'rejected' | 'unauthorized' | 'rate_limited' | 'error'
  status: number
  duration_ms: number
  project_id?: string
  api_key_id?: string
  key_type?: string
  accepted?: number
  rejected?: number
  error_code?: string
  message?: string
}

export function logRequest(entry: RequestLog): void {
  // Never log the key itself, the raw payload, or an IP address. The key id is enough to
  // identify which credential misbehaved.
  console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), ...entry }))
}
