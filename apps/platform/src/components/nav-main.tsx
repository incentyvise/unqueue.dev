import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  BarChart2Icon,
  BellIcon,
  BookmarkIcon,
  LayoutDashboardIcon,
  LayersIcon,
  DatabaseZapIcon,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  workspaceId,
  environmentId,
}: {
  workspaceId: string;
  environmentId: string;
}) {
  const matchRoute = useMatchRoute();

  const isOverviewActive = !!matchRoute({
    to: "/$workspaceId/$environmentId",
    params: { workspaceId, environmentId },
    fuzzy: false,
  });

  const isBookmarksActive = !!matchRoute({
    to: "/$workspaceId/bookmarks",
    params: { workspaceId },
  });

  const isConnectionsActive = !!matchRoute({
    to: "/$workspaceId/connections",
    params: { workspaceId },
  });

  const isQueuesActive = !!matchRoute({
    to: "/$workspaceId/$environmentId/queues",
    params: { workspaceId, environmentId },
    fuzzy: true,
  });

  const isStatsActive = !!matchRoute({
    to: "/$workspaceId/$environmentId/stats",
    params: { workspaceId, environmentId },
  });

  const isAlertsActive = !!matchRoute({
    to: "/$workspaceId/settings/alerts",
    params: { workspaceId },
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isOverviewActive} tooltip="Overview">
            <Link
              to="/$workspaceId/$environmentId"
              params={{ workspaceId, environmentId }}
            >
              <LayoutDashboardIcon />
              <span>Overview</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isQueuesActive} tooltip="Queues">
            <Link
              to="/$workspaceId/$environmentId/queues"
              params={{ workspaceId, environmentId }}
            >
              <LayersIcon />
              <span>Queues</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isStatsActive} tooltip="Stats">
            <Link
              to="/$workspaceId/$environmentId/stats"
              params={{ workspaceId, environmentId }}
            >
              <BarChart2Icon />
              <span>Stats</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isBookmarksActive} tooltip="Bookmarks">
            <Link to="/$workspaceId/bookmarks" params={{ workspaceId }}>
              <BookmarkIcon />
              <span>Bookmarks</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={isConnectionsActive}
            tooltip="Connections"
          >
            <Link to="/$workspaceId/connections" params={{ workspaceId }}>
              <DatabaseZapIcon />
              <span>Connections</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isAlertsActive} tooltip="Alerts">
            <Link to="/$workspaceId/settings/alerts" params={{ workspaceId }}>
              <BellIcon />
              <span>Alerts</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
