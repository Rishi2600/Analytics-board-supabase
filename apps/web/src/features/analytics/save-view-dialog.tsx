import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/errors'
import { useCreateSavedView, type SavedViewQuery } from './saved-views'

interface Props {
  projectId: string
  query: SavedViewQuery
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SaveViewDialog({ projectId, query, open, onOpenChange }: Props) {
  const createView = useCreateSavedView(projectId)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [nameMissing, setNameMissing] = useState(false)

  const close = () => {
    onOpenChange(false)
    setName('')
    setShared(false)
    setNameMissing(false)
  }

  const onSave = async () => {
    if (name.trim().length === 0) {
      setNameMissing(true)
      return
    }
    try {
      await createView.mutateAsync({ name: name.trim(), query, isShared: shared })
      toast.success('View saved')
      close()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave()
          }}
        >
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Saves the current event, filter, breakdown and date range under a name.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={nameMissing || undefined}>
              <FieldLabel htmlFor="view-name">Name</FieldLabel>
              <Input
                id="view-name"
                placeholder="Pro plan checkouts"
                aria-invalid={nameMissing || undefined}
                aria-describedby={nameMissing ? 'view-name-error' : undefined}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameMissing(false)
                }}
              />
              {nameMissing ? (
                <FieldError id="view-name-error">Give the view a name</FieldError>
              ) : null}
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="view-shared">Share with the project</FieldLabel>
                <FieldDescription>
                  Everyone on this project sees it. Only you can delete it.
                </FieldDescription>
              </FieldContent>
              <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={createView.isPending}>
              {createView.isPending ? <Spinner data-icon="inline-start" /> : null}
              {createView.isPending ? 'Saving view' : 'Save view'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
