import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApiKeys } from '@/features/keys/api'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * The install screen, and the product's first impression.
 *
 * The live indicator is the important part. Without it, a customer pastes a snippet and
 * then has to guess whether it worked, refreshing an empty dashboard. With it, the answer
 * arrives in under a second over Realtime and the question never forms.
 */
export function InstallSnippet({ projectId }: { projectId: string }) {
  const keys = useApiKeys(projectId)
  const [copied, setCopied] = useState(false)
  const [firstEventSeen, setFirstEventSeen] = useState(false)

  const activeKey = keys.data?.find((k) => k.key_type === 'public' && !k.revoked_at)
  const ingestUrl = `${env.VITE_SUPABASE_URL}/functions/v1`

  useEffect(() => {
    // Has anything arrived already? A customer who installed the snippet yesterday should
    // not see "waiting" forever.
    void supabase
      .from('events_raw')
      .select('id', { head: true, count: 'exact' })
      .eq('project_id', projectId)
      .then(({ count }) => {
        if ((count ?? 0) > 0) setFirstEventSeen(true)
      })

    const channel = supabase
      .channel(`install-watch-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events_raw',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          setFirstEventSeen(true)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [projectId])

  const snippet = `<script type="module">
  import { init, page } from 'https://cdn.jsdelivr.net/npm/@analytics/sdk/dist/analytics.js'

  init({
    key: '${activeKey?.key_prefix ?? 'pk_live_...'}...',
    host: '${ingestUrl}',
  })

  page()
</script>`

  const curlExample = `curl -X POST '${ingestUrl}/ingest' \\
  -H 'Authorization: Bearer ${activeKey?.key_prefix ?? 'pk_live_...'}...' \\
  -H 'Content-Type: application/json' \\
  -d '{"batch":[{"event":"test_event","distinct_id":"u_1"}]}'`

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Snippet copied')
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      toast.error('Could not reach the clipboard. Select the snippet and copy it manually.')
    }
  }

  return (
    <section className="space-y-6 px-6 py-5">
      <div>
        <h2 className="text-sm font-medium">Install</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop this into your site. Replace the key with the full value you copied when you created
          it, since we only store a hash and cannot fill it in for you.
        </p>
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-xs">
          {snippet}
        </pre>
        <Button
          variant="outline"
          size="icon"
          className="absolute top-2 right-2"
          aria-label="Copy snippet"
          onClick={() => void onCopy(snippet)}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </div>

      <div className="flex items-center gap-2.5 rounded-md border px-4 py-3" aria-live="polite">
        <span
          className={
            firstEventSeen
              ? 'size-2 shrink-0 rounded-full bg-ok'
              : 'size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground'
          }
        />
        <p className="text-sm">
          {firstEventSeen ? (
            <>
              <span className="font-medium">First event received.</span>{' '}
              <span className="text-muted-foreground">
                Your dashboard fills in as the rollup job runs, within about five minutes.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">Waiting for your first event.</span>{' '}
              <span className="text-muted-foreground">
                This updates the moment one arrives. You can leave this page open.
              </span>
            </>
          )}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Or send one from a terminal</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Useful for checking the key works before you touch your application code.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border bg-muted p-4 font-mono text-xs">
          {curlExample}
        </pre>
      </div>
    </section>
  )
}
