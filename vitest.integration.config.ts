import { defineConfig } from 'vitest/config'

// Database tests run against the local Supabase stack, which must already be running.
// They are separate from the unit tests in apps/web because they need Docker, take
// seconds rather than milliseconds, and share one database.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One database, shared. Parallel files would interleave fixtures and produce failures
    // that look like policy bugs but are not.
    fileParallelism: false,
  },
})
