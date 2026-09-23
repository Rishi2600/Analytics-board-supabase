import { Check, CircleAlert, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage } from '@/lib/errors'
import { useCreateApiKey, type CreatedApiKey } from './api'

interface Props {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Two states in one dialog: the form, then the key. The reveal is not a toast or a table row,
 * because the user has exactly one chance to copy it and both of those are easy to dismiss.
 */
export function CreateKeyDialog({ projectId, open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  const [keyType, setKeyType] = useState<'public' | 'secret'>('public')
  const [nameMissing, setNameMissing] = useState(false)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const createKey = useCreateApiKey(projectId)

  const close = () => {
    onOpenChange(false)
    setName('')
    setKeyType('public')
    setNameMissing(false)
    setCreated(null)
    setCopied(false)
    setFailure(null)
  }

  const onSubmit = async () => {
    setFailure(null)
    if (name.trim().length === 0) {
      setNameMissing(true)
      return
    }
    try {
      setCreated(await createKey.mutateAsync({ name: name.trim(), keyType }))
      toast.success('Key created')
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  const onCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.api_key)
      setCopied(true)
      toast.success('Key copied')
    } catch {
      setFailure('The clipboard is not available here. Select the key and copy it by hand.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Key created</DialogTitle>
              <DialogDescription>
                Copy it now. We store only a hash, so this is the last time it can be shown. If you
                lose it, revoke this key and create another.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-md border bg-muted px-2.5 py-2 font-mono text-xs wrap-anywhere">
                {created.api_key}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void onCopy()}
                aria-label="Copy key"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Create key</DialogTitle>
              <DialogDescription>
                Public keys go in browser code and can only write events. Secret keys are for your
                servers and are refused if a browser sends them.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field data-invalid={nameMissing || undefined}>
                <FieldLabel htmlFor="key-name">Name</FieldLabel>
                <Input
                  id="key-name"
                  placeholder="Web (production)"
                  aria-invalid={nameMissing || undefined}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameMissing(false)
                  }}
                />
                {nameMissing ? (
                  <FieldError>Give the key a name, so you can tell keys apart later</FieldError>
                ) : (
                  <FieldDescription>
                    Used to tell keys apart when you need to revoke one.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="key-type">Type</FieldLabel>
                <Select
                  value={keyType}
                  onValueChange={(value) => {
                    setKeyType(value === 'secret' ? 'secret' : 'public')
                  }}
                >
                  <SelectTrigger id="key-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="public">Public, for browsers</SelectItem>
                      <SelectItem value="secret">Secret, for servers</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            {failure ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>The key was not created</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={createKey.isPending}>
                {createKey.isPending ? <Spinner data-icon="inline-start" /> : null}
                {createKey.isPending ? 'Creating key' : 'Create key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
