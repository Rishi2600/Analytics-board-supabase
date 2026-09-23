import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MAX_STEPS = 8

const WINDOW_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '1 day' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
]

interface Props {
  steps: string[]
  available: string[]
  windowHours: number
  onStepsChange: (steps: string[]) => void
  onWindowChange: (hours: number) => void
}

/** Choose the funnel's steps, in order, and how long someone has between them. */
export function FunnelBuilder({
  steps,
  available,
  windowHours,
  onStepsChange,
  onWindowChange,
}: Props) {
  const setStep = (index: number, event: string) => {
    onStepsChange(steps.map((step, i) => (i === index ? event : step)))
  }

  return (
    <Card size="sm">
      <CardContent>
        <FieldGroup className="gap-6 lg:flex-row lg:items-start">
          <FieldSet className="flex-1">
            <FieldLegend variant="label">Steps, in order</FieldLegend>
            <ol className="flex flex-col gap-2">
              {steps.map((step, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="tabular w-5 text-sm text-muted-foreground">{index + 1}</span>
                  <Select
                    value={step}
                    onValueChange={(value) => {
                      setStep(index, value)
                    }}
                  >
                    <SelectTrigger
                      className="w-full min-w-0 sm:w-72"
                      aria-label={`Step ${String(index + 1)}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {available.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {steps.length > 2 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove step ${String(index + 1)}, ${step}`}
                      onClick={() => {
                        onStepsChange(steps.filter((_, i) => i !== index))
                      }}
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
            <div>
              <Button
                variant="outline"
                disabled={steps.length >= MAX_STEPS || available.length === 0}
                onClick={() => {
                  const next = available.find((name) => !steps.includes(name)) ?? available[0]
                  if (next) onStepsChange([...steps, next])
                }}
              >
                <Plus data-icon="inline-start" />
                Add step
              </Button>
            </div>
          </FieldSet>

          <Field className="lg:w-56">
            <FieldLabel htmlFor="funnel-window">Conversion window</FieldLabel>
            <Select
              value={String(windowHours)}
              onValueChange={(value) => {
                onWindowChange(Number(value))
              }}
            >
              <SelectTrigger id="funnel-window" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.hours} value={String(option.hours)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              How long someone has to reach each next step before they stop counting.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
