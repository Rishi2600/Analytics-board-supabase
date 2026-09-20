import { z } from 'zod'

/**
 * Client environment, validated once at startup.
 *
 * Only variables prefixed VITE_ exist here, and that prefix means Vite inlines the value
 * into the browser bundle. Nothing secret can live in this file. The anon key below is
 * public by design and is useless on its own, because row level security is what actually
 * protects the data.
 *
 * Validating at startup rather than at first use turns a misconfigured deployment into an
 * immediate, readable error instead of a confusing 401 somewhere deep in a query.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.url(
    'VITE_SUPABASE_URL must be a full URL, for example https://abc.supabase.co',
  ),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks empty or truncated'),
})

const parsed = schema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `The app is missing its Supabase configuration.\n\n${details}\n\n` +
      'Copy .env.example to .env.local and fill it in. For local development the values ' +
      'come from `npx supabase status`.',
  )
}

export const env = parsed.data
