import { NavLink, useParams } from 'react-router'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null

  return (
    <nav
      aria-label="Sections"
      className={cn(
        'flex shrink-0 flex-col gap-0.5 border-r bg-sidebar py-2 transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-52',
      )}
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={`/p/${projectId}/${item.to}`}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'mx-2 flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? // The 2px left rule. Nothing else in the product uses one, so it means
                  // exactly one thing: you are here.
                  'nav-active bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )
          }
        >
          <item.icon size={16} className="shrink-0" />
          {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
