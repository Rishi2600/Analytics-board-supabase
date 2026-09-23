import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supportedTimeZones, timeZoneOffsetLabel } from '@/lib/tz'

interface Props {
  id: string
  value: string
  onChange: (timeZone: string) => void
  'aria-describedby'?: string
}

/** Around four hundred zones. Searchable, because nobody scrolls to Asia/Kolkata. */
export function TimezonePicker({ id, value, onChange, ...props }: Props) {
  const [open, setOpen] = useState(false)
  const zones = useMemo(() => supportedTimeZones(), [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-describedby={props['aria-describedby']}
          // A form control, so it takes the input's border and fill rather than a button's.
          className="w-full justify-between border-input bg-transparent font-normal"
        >
          <span className="truncate">{value}</span>
          <ChevronsUpDown data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones" />
          <CommandList>
            <CommandEmpty>No timezone has that name.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  onSelect={() => {
                    onChange(zone)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 wrap-anywhere">{zone}</span>
                  <span className="text-xs text-muted-foreground">{timeZoneOffsetLabel(zone)}</span>
                  {zone === value ? <Check aria-label="Selected" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
