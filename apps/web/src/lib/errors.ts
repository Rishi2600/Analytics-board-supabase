/**
 * Turns anything that was thrown into one readable line.
 *
 * Supabase hands back PostgrestError objects rather than Error instances, fetch throws
 * TypeError, and a rejected promise can carry anything at all. Every error surface in the
 * product goes through here so that none of them ever renders "[object Object]".
 */
export function errorMessage(error: unknown): string {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && 'message' in error) {
    const { message } = error
    if (typeof message === 'string') return message
  }

  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error)
  }

  try {
    return JSON.stringify(error) ?? 'Unknown error'
  } catch {
    return 'Unknown error'
  }
}
