import { Bookmark, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/data/confirm-dialog'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/use-auth'
import { errorMessage } from '@/lib/errors'
import {
  useDeleteSavedView,
  useSavedViews,
  type SavedView,
  type SavedViewQuery,
} from './saved-views'

interface Props {
  projectId: string
  onApply: (query: SavedViewQuery) => void
}

export function SavedViewsCard({ projectId, onApply }: Props) {
  const { user } = useAuth()
  const views = useSavedViews(projectId)
  const deleteView = useDeleteSavedView(projectId)
  const [deleting, setDeleting] = useState<SavedView | null>(null)

  const onDelete = async () => {
    if (!deleting) return
    try {
      await deleteView.mutateAsync(deleting.id)
      toast.success('View deleted')
      setDeleting(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <DataCard title="Saved views">
      {views.isPending ? (
        <TableSkeleton rows={3} columns={2} />
      ) : views.isError ? (
        <ErrorState
          title="Saved views did not load"
          description="Your views are safe; this is a read that failed. Try again."
          error={views.error}
          onRetry={() => void views.refetch()}
        />
      ) : views.data.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved views yet"
          description="Set up a question you ask often, then choose Save view so it is one click away next time."
        />
      ) : (
        <ul className="flex flex-col">
          {views.data.map((view) => (
            <li
              key={view.id}
              className="group/row flex items-center gap-3 border-b px-4 py-2 last:border-b-0"
            >
              <Button
                variant="ghost"
                className="-ml-2 h-auto min-w-0 flex-1 justify-start px-2 py-1.5 text-left font-normal whitespace-normal"
                onClick={() => {
                  onApply(view.query)
                }}
              >
                {view.name}
              </Button>
              {view.is_shared ? <Badge variant="secondary">Shared</Badge> : null}
              {view.created_by === user?.id ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="row-actions"
                  aria-label={`Delete view ${view.name}`}
                  onClick={() => {
                    setDeleting(view)
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? 'this view'}?`}
        description={
          deleting?.is_shared
            ? 'It disappears for everyone on this project. The events it showed are not affected.'
            : 'The events it showed are not affected. This cannot be undone.'
        }
        confirmLabel="Delete view"
        pendingLabel="Deleting view"
        pending={deleteView.isPending}
        onConfirm={() => void onDelete()}
      />
    </DataCard>
  )
}
