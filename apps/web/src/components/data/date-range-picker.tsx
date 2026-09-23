import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { presetById, RANGE_PRESETS } from '@/features/analytics/date-range'

interface Props {
  value: string
  onChange: (presetId: string) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={`Date range: ${presetById(value).label}`}>
          <CalendarRange data-icon="inline-start" />
          {presetById(value).label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {RANGE_PRESETS.map((preset) => (
            <DropdownMenuRadioItem key={preset.id} value={preset.id}>
              {preset.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
