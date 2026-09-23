/**
 * Words for values the database stores as codes. Nothing in the interface prints a raw
 * `queued` or `bot_filtered`; it goes through here, and an unknown code falls back to
 * itself so a new value is visible rather than blank.
 */

export const EXPORT_KIND_LABELS: Record<string, string> = {
  events: 'Raw events',
  timeseries: 'Events over time',
  breakdown: 'Property breakdown',
}

export const EXPORT_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Ready',
  failed: 'Failed',
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

export const ROLE_HELP: Record<string, string> = {
  owner: 'Everything, including deleting the organization',
  admin: 'Projects, keys and people',
  member: 'Read the dashboard and save views',
  viewer: 'Read only',
}

/** Rejection reasons, as the ingest function writes them, with what to do about each. */
export const REJECTION_LABELS: Record<string, { title: string; fix: string }> = {
  invalid_event: {
    title: 'Malformed event',
    fix: 'An event is missing its name or distinct_id, or a field has the wrong type.',
  },
  bot_filtered: {
    title: 'Sent by a known bot',
    fix: 'Dropped because bot filtering is on. Turn it off in Settings if you want crawler traffic.',
  },
  too_many_properties: {
    title: 'Too many properties',
    fix: 'Send fewer properties per event, or nest related ones in a single object.',
  },
  property_key_too_long: {
    title: 'Property name too long',
    fix: 'Shorten the property name.',
  },
  property_value_too_large: {
    title: 'Property value too large',
    fix: 'Send a shorter value, or an identifier instead of the full content.',
  },
  property_too_deep: {
    title: 'Properties nested too deeply',
    fix: 'Flatten the object you are sending as a property.',
  },
}

export function labelFor(labels: Record<string, string>, code: string): string {
  return labels[code] ?? code
}
