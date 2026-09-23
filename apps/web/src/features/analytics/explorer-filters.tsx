import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const ALL_EVENTS = '__all__'
export const NOTHING = '__none__'

export interface ExplorerFilters {
  event: string
  filterKey: string
  filterValue: string
  breakdown: string
}

interface Props {
  value: ExplorerFilters
  onChange: (next: ExplorerFilters) => void
  eventNames: string[]
  propertyKeys: string[]
}

export function ExplorerFilterBar({ value, onChange, eventNames, propertyKeys }: Props) {
  const set = (patch: Partial<ExplorerFilters>) => {
    onChange({ ...value, ...patch })
  }
  const noFilter = value.filterKey === NOTHING

  return (
    <Card size="sm">
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="event-select">Event</FieldLabel>
            <OptionSelect
              id="event-select"
              value={value.event}
              onValueChange={(event) => {
                set({ event })
              }}
              first={{ value: ALL_EVENTS, label: 'All events' }}
              options={eventNames}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="filter-key">Where property</FieldLabel>
            <OptionSelect
              id="filter-key"
              value={value.filterKey}
              onValueChange={(filterKey) => {
                set({ filterKey, filterValue: filterKey === NOTHING ? '' : value.filterValue })
              }}
              first={{ value: NOTHING, label: 'No filter' }}
              options={propertyKeys}
            />
          </Field>

          <Field data-disabled={noFilter || undefined}>
            <FieldLabel htmlFor="filter-value">Equals</FieldLabel>
            <Input
              id="filter-value"
              placeholder={noFilter ? 'Choose a property first' : 'pro'}
              disabled={noFilter}
              value={value.filterValue}
              onChange={(e) => {
                set({ filterValue: e.target.value })
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="breakdown-select">Break down by</FieldLabel>
            <OptionSelect
              id="breakdown-select"
              value={value.breakdown}
              onValueChange={(breakdown) => {
                set({ breakdown })
              }}
              first={{ value: NOTHING, label: 'Nothing' }}
              options={propertyKeys}
            />
          </Field>
        </FieldGroup>
        <FieldDescription className="mt-3 text-xs">
          One property filter at a time. Filters read pre-aggregated data, and combining several
          would need an aggregate for every combination of properties.
        </FieldDescription>
      </CardContent>
    </Card>
  )
}

function OptionSelect({
  id,
  value,
  onValueChange,
  first,
  options,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  first: { value: string; label: string }
  options: string[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={first.value}>{first.label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
