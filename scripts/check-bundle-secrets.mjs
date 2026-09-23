#!/usr/bin/env node
/**
 * Fails if real secret material, or development-only code, reached the built frontend
 * bundle.
 *
 * The dashboard bundle is public. The anon key belongs there; a service role key or a
 * customer's secret API key does not.
 *
 * This replaced a grep for the strings "service_role", "sk_live_" and "sb_secret_", which
 * was wrong in both directions and worth writing down:
 *
 *   False negative, the serious one. A Supabase service role key is a JWT. Its role claim
 *   lives in a base64url payload, so the literal text "service_role" never appears in the
 *   bundle and the grep would have passed a leaked key without comment. The check has to
 *   decode candidate JWTs and read the claim.
 *
 *   False positive. supabase-js contains `e.startsWith('sb_secret_')` in its own key
 *   format detection, so the prefix appears as library source with no key attached. A
 *   prefix is only interesting when followed by enough characters to be a real token.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const bundleDir = process.argv[2] ?? 'apps/web/dist'

// A prefix followed by enough characters to be an actual token rather than a mention.
const KEY_PATTERNS = [
  { name: 'secret project API key', re: /\bsk_live_[A-Za-z0-9_-]{20,}/g },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
]

// Three base64url segments. Candidates are decoded rather than pattern matched.
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g

// Development-only code that must not ship. `lib/dev-state.ts` lets a URL parameter force
// every read into a loading, empty or error state, which is a debugging aid in dev and a
// way to make a customer's dashboard lie in production. It is guarded by
// `import.meta.env.DEV`; this proves the guard actually removed it.
const DEV_ONLY_MARKERS = [
  { name: 'forced state override (lib/dev-state.ts)', text: 'forced-state-override' },
]

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

function decodeJwtRole(token) {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const claims = JSON.parse(json)
    return typeof claims.role === 'string' ? claims.role : null
  } catch {
    // Not a JWT after all. Plenty of base64-looking strings are not.
    return null
  }
}

let files
try {
  files = walk(bundleDir)
} catch {
  console.error(`check-bundle-secrets: no build output at ${bundleDir}. Run the build first.`)
  process.exit(1)
}

const findings = []

for (const file of files) {
  if (/\.(png|jpe?g|gif|webp|woff2?|ttf|eot|ico|map)$/i.test(file)) continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  for (const { name, re } of KEY_PATTERNS) {
    for (const match of content.matchAll(re)) {
      findings.push(`${file}: ${name} (${match[0].slice(0, 16)}...)`)
    }
  }

  for (const match of content.matchAll(JWT_RE)) {
    const role = decodeJwtRole(match[0])
    // anon and authenticated are public by design and belong in the bundle.
    if (role && role !== 'anon' && role !== 'authenticated') {
      findings.push(`${file}: JWT with role "${role}"`)
    }
  }

  for (const { name, text } of DEV_ONLY_MARKERS) {
    if (content.includes(text)) findings.push(`${file}: ${name}`)
  }
}

if (findings.length > 0) {
  console.error(`check-bundle-secrets: FAIL - ${bundleDir} contains what it must not`)
  for (const finding of findings) console.error(`  ${finding}`)
  process.exit(1)
}

console.log(
  `check-bundle-secrets: ok - scanned ${files.length} files in ${bundleDir}, ` +
    'no service role or secret key material, no development-only code',
)
