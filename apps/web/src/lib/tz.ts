import { format as formatDate } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

/**
 * Project timezone helpers.
 *
 * Rollups are stored in UTC and converted at query time. Nothing in the interface should
 * ever format a timestamp in the browser's timezone, because the browser's timezone is
 * whatever laptop the user happens to have open, and two people looking at the same
 * dashboard would see different days.
 */

/** The timezone the browser is in. Offered as a default when creating a project. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'
}

/** A short label for the header beside the date range, for example "Asia/Kolkata". */
export function timeZoneLabel(timeZone: string): string {
  return timeZone.replace(/_/g, ' ')
}

/** The UTC offset as people write it, for example "UTC+05:30". */
export function timeZoneOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    return `UTC${formatInTimeZone(at, timeZone, 'xxx')}`
  } catch {
    return 'UTC'
  }
}

/** An axis tick or table cell, rendered in the project's timezone. */
export function formatInProjectZone(
  input: string | Date,
  timeZone: string,
  pattern: string,
): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return '-'
  try {
    return formatInTimeZone(date, timeZone, pattern)
  } catch {
    return formatDate(date, pattern)
  }
}

/** The same instant, shifted so that date-fns calendar maths lands on the project's day. */
export function inProjectZone(input: string | Date, timeZone: string): Date {
  const date = typeof input === 'string' ? new Date(input) : input
  try {
    return toZonedTime(date, timeZone)
  } catch {
    return date
  }
}

/** Is this an IANA name Postgres and the browser both understand? */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Every timezone the runtime knows, for the project settings picker. */
export function supportedTimeZones(): string[] {
  const supported = Intl.supportedValuesOf?.('timeZone')
  return supported && supported.length > 0 ? [...supported] : ['Etc/UTC']
}
