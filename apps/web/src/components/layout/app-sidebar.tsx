import { ChartNoAxesColumn } from 'lucide-react'
import { NavLink, useLocation, useParams } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { ANALYSIS_ITEMS, PROJECT_ITEMS, type NavItem } from './nav-items'

export function AppSidebar() {
  const { projectId = '' } = useParams<{ projectId: string }>()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Overview">
              <NavLink to={`/p/${projectId}/overview`}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ChartNoAxesColumn />
                </span>
                <span className="font-medium">Analytics</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Analysis" items={ANALYSIS_ITEMS} projectId={projectId} />
        <NavGroup label="Project" items={PROJECT_ITEMS} projectId={projectId} />
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}

function NavGroup({
  label,
  items,
  projectId,
}: {
  label: string
  items: NavItem[]
  projectId: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const to = `/p/${projectId}/${item.to}`
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={item.label}>
                  <NavLink
                    to={to}
                    onClick={() => {
                      // On a phone the sidebar is a sheet over the page. Left open, it hides
                      // the screen you just chose.
                      if (isMobile) setOpenMobile(false)
                    }}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
