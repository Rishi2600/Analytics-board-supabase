import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Enforces the SDK size budget.
 *
 * This ships inside every customer's application, on their critical path. A budget that is
 * only written in a document drifts; a budget that fails the build does not. 5KB gzipped
 * is the number the brief set, and this is what holds us to it.
 */
const BUDGET_BYTES = 5 * 1024

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '../dist/analytics.js')

if (!existsSync(target)) {
  console.error('No build output. Run `npm run build -w packages/sdk` first.')
  process.exit(1)
}

const raw = readFileSync(target)
const gzipped = gzipSync(raw, { level: 9 }).length
const percent = ((gzipped / BUDGET_BYTES) * 100).toFixed(1)

console.log(`SDK size: ${raw.length} bytes raw, ${gzipped} bytes gzipped`)
console.log(`Budget:   ${BUDGET_BYTES} bytes gzipped (${percent}% used)`)

if (gzipped > BUDGET_BYTES) {
  console.error(`\nOver budget by ${gzipped - BUDGET_BYTES} bytes.`)
  process.exit(1)
}
