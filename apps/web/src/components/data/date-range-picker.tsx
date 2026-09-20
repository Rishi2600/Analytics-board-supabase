import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RANGE_PRESETS } from '@/features/analytics/date-range'

interface Props {
  value: string
  onChange: (presetId: string) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  const active = RANGE_PRESETS.find((p) => p.id === value) ?? RANGE_PRESETS[1]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-normal">
          <Calendar size={16} />
          {active?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {RANGE_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onSelect={() => {
              onChange(preset.id)
            }}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
