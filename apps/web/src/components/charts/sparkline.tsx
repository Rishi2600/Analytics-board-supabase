import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { strokeClass } from './series-styles'

/**
 * The sparkline on a KPI card. No axes, no tooltip, no grid: its only job is to say
 * whether the number has been climbing or falling, which needs shape and nothing else.
 */
export function Sparkline({ data, colorIndex = 0 }: { data: number[]; colorIndex?: number }) {
  const points = data.map((value, index) => ({ index, value }))

  return (
    <div className="h-8 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            className={strokeClass(colorIndex)}
            stroke="currentColor"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
