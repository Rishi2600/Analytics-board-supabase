import { Check, CircleCheck, CircleDashed, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DataCard } from '@/components/data/data-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useApiKeys } from '@/features/keys/api'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * The install screen, and the product's first impression. The status line is the important
 * part: it turns "did that work?" into an answer that arrives within a second over Realtime.
 */
export function InstallSnippet({ projectId }: { projectId: string }) {
  const keys = useApiKeys(projectId)
  const [firstEventSeen, setFirstEventSeen] = useState(false)

  const keyPrefix = keys.data?.find((k) => k.key_type === 'public' && !k.revoked_at)?.key_prefix
  const ingestUrl = `${env.VITE_SUPABASE_URL}/functions/v1`

  useEffect(() => {
    // Someone who installed the snippet yesterday should not see "waiting" forever. One row
    // answers the question; an exact count scans every event under row level security.
    void supabase
      .from('events_raw')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setFirstEventSeen(true)
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

  const key = `${keyPrefix ?? 'pk_live_'}...`
  const snippet = `<script type="module">
  import { init, page } from 'https://cdn.jsdelivr.net/npm/@analytics/sdk/dist/analytics.js'

  init({
    key: '${key}',
    host: '${ingestUrl}',
  })

  page()
</script>`

  const curl = `curl -X POST '${ingestUrl}/ingest' \\
  -H 'Authorization: Bearer ${key}' \\
  -H 'Content-Type: application/json' \\
  -d '{"batch":[{"event":"test_event","distinct_id":"u_1"}]}'`

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <DataCard
        title="Install"
        description="Add this to every page of your site. Replace the key with the full value you copied when you created it; we store only a hash, so we cannot fill it in for you."
        action={<CopyButton text={snippet} label="Copy snippet" />}
      >
        <pre className="overflow-x-auto p-4 font-mono text-xs">{snippet}</pre>
      </DataCard>

      <div aria-live="polite">
        {firstEventSeen ? (
          <Alert role={undefined}>
            <CircleCheck className="text-ok" />
            <AlertTitle>First event received</AlertTitle>
            <AlertDescription>
              Your dashboard fills in as aggregation runs, within about five minutes.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert role={undefined}>
            <CircleDashed />
            <AlertTitle>Waiting for your first event</AlertTitle>
            <AlertDescription>
              This changes the moment one arrives. You can leave this page open while you install.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <DataCard
        title="Or send one from a terminal"
        description="Useful for checking a key works before you change any application code."
        action={<CopyButton text={curl} label="Copy command" />}
      >
        <pre className="overflow-x-auto p-4 font-mono text-xs">{curl}</pre>
      </DataCard>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied')
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      toast.error('The clipboard is not available here. Select the text and copy it by hand.')
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void onCopy()}>
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? 'Copied' : label}
    </Button>
  )
}
