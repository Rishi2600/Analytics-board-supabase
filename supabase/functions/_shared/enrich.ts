/**
 * Turning a request into the context we actually store.
 *
 * Deliberately dependency free. A user agent parser is a large table of regular
 * expressions that needs updating forever; what the dashboard needs is a coarse family,
 * operating system and device class, and that is a short function. When someone genuinely
 * needs "Chrome 118.0.5993.88 on Ventura", the raw user agent is still in context.
 */

export interface UserAgentInfo {
  ua_family: string
  os: string
  device_type: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'
}

const BOT_PATTERNS = [
  'bot',
  'crawler',
  'spider',
  'crawling',
  'headlesschrome',
  'phantomjs',
  'slurp',
  'curl/',
  'wget/',
  'python-requests',
  'axios/',
  'go-http-client',
  'lighthouse',
  'pingdom',
  'uptimerobot',
  'semrush',
  'ahrefs',
]

export function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern))
}

export function parseUserAgent(userAgent: string | null): UserAgentInfo {
  if (!userAgent) return { ua_family: 'unknown', os: 'unknown', device_type: 'unknown' }

  const ua = userAgent.toLowerCase()

  if (isBot(ua)) return { ua_family: 'bot', os: 'unknown', device_type: 'bot' }

  // Order matters. Edge contains "chrome", Chrome contains "safari", and every one of them
  // contains "mozilla". Most specific first.
  let family = 'unknown'
  if (ua.includes('edg/')) family = 'Edge'
  else if (ua.includes('opr/') || ua.includes('opera')) family = 'Opera'
  else if (ua.includes('firefox/')) family = 'Firefox'
  else if (ua.includes('chrome/')) family = 'Chrome'
  else if (ua.includes('safari/')) family = 'Safari'

  let os = 'unknown'
  if (ua.includes('windows nt')) os = 'Windows'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS'
  else if (ua.includes('mac os x') || ua.includes('macintosh')) os = 'macOS'
  else if (ua.includes('cros')) os = 'ChromeOS'
  else if (ua.includes('linux')) os = 'Linux'

  let device: UserAgentInfo['device_type'] = 'desktop'
  if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) device = 'tablet'
  else if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android'))
    device = 'mobile'

  return { ua_family: family, os, device_type: device }
}

/**
 * A salted, daily rotating hash of the client IP. The raw address is never stored.
 *
 * The date is part of the input on purpose: the same visitor produces a different hash
 * tomorrow, which means the hash is usable for same-day deduplication and useless for
 * tracking someone across weeks. That is the trade we want.
 */
export async function hashIp(ip: string | null, salt: string): Promise<string | null> {
  if (!ip) return null
  const day = new Date().toISOString().slice(0, 10)
  const input = new TextEncoder().encode(`${salt}:${day}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The client IP as the edge saw it. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip')
}

/** Country from the edge geo header, when the platform provides one. */
export function clientCountry(request: Request): string | null {
  return (
    request.headers.get('cf-ipcountry') ??
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('x-country-code')
  )
}
