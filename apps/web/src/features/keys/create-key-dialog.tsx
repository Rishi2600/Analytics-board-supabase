import { Check, Copy } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage } from '@/lib/errors'
import { useCreateApiKey, type CreatedApiKey } from './api'

interface Props {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Two states in one dialog: the form, then the key.
 *
 * The reveal is not a toast and not a row in the table, because the user has exactly one
 * chance to copy it and both of those can be dismissed by accident. They have to close
 * this deliberately.
 */
export function CreateKeyDialog({ projectId, open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  const [keyType, setKeyType] = useState<'public' | 'secret'>('public')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const createKey = useCreateApiKey(projectId)

  const reset = () => {
    setName('')
    setKeyType('public')
    setCreated(null)
    setCopied(false)
    setFailure(null)
  }

  const onSubmit = async () => {
    setFailure(null)
    try {
      const result = await createKey.mutateAsync({ name: name.trim(), keyType })
      setCreated(result)
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
      setFailure('Could not reach the clipboard. Select the key and copy it manually.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
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

            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm border bg-muted px-2.5 py-2 font-mono text-xs">
                {created.api_key}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void onCopy()}
                aria-label="Copy key"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>

            {failure ? (
              <p className="text-xs text-destructive" role="alert">
                {failure}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                onClick={() => {
                  reset()
                  onOpenChange(false)
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create key</DialogTitle>
              <DialogDescription>
                Public keys go in browser code and can only write events. Secret keys are for your
                servers and are rejected if a browser sends them.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  className="mt-1.5"
                  placeholder="Web (production)"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Used to tell keys apart when you need to revoke one.
                </p>
              </div>

              <div>
                <Label htmlFor="key-type">Type</Label>
                <Select
                  value={keyType}
                  onValueChange={(value) => {
                    setKeyType(value === 'secret' ? 'secret' : 'public')
                  }}
                >
                  <SelectTrigger id="key-type" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public, for browsers</SelectItem>
                    <SelectItem value="secret">Secret, for servers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {failure ? (
                <p className="text-xs text-destructive" role="alert">
                  {failure}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void onSubmit()}
                disabled={name.trim().length === 0 || createKey.isPending}
              >
                {createKey.isPending ? 'Creating' : 'Create key'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
