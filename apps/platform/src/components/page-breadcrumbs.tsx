import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon, ServerIcon } from "lucide-react";
import { parseRouteParamsFromPathname } from "@/lib/parse-route-params";
import { getPreferredEnvironmentId, setPreferredEnvironmentId } from "@/lib/preferences";
import { rpcClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function EnvironmentDropdown({
  workspaceId,
  environmentId,
}: {
  workspaceId: string;
  environmentId?: string;
}) {
  const navigate = useNavigate();

  const { data: environments = [] } = useQuery({
    queryKey: ["environments", workspaceId],
    queryFn: () => rpcClient.environment.list({ workspaceId }),
  });

  const activeId = environmentId ?? getPreferredEnvironmentId(workspaceId) ?? environments[0]?.id;
  const active = environments.find((e) => e.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-sm font-normal text-primary-foreground outline-none hover:bg-primary/90 data-[state=open]:bg-primary/90">
        <ServerIcon className="size-3.5 shrink-0" />
        <span className="max-w-[10rem] truncate">{active?.name ?? "Environment"}</span>
        <ChevronsUpDownIcon className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Environments
        </DropdownMenuLabel>
        {environments.map((env) => {
          const isActive = env.id === activeId;
          return (
            <DropdownMenuItem
              key={env.id}
              className="gap-2"
              onClick={() => {
                if (isActive) return;
                setPreferredEnvironmentId(workspaceId, env.id);
                navigate({
                  to: "/$workspaceId/$environmentId",
                  params: { workspaceId, environmentId: env.id },
                  replace: false,
                });
              }}
            >
              <div className="flex size-5 items-center justify-center rounded border">
                <ServerIcon className="size-3 shrink-0" />
              </div>
              <span className="flex-1 truncate">{env.name}</span>
              <CheckIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageBreadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workspaceId, environmentId, queueName } =
    parseRouteParamsFromPathname(pathname);

  const segments: { label: string; to?: string; params?: Record<string, string> }[] = [];

  if (pathname === "/login") {
    segments.push({ label: "Sign in" });
  } else if (pathname === "/signup") {
    segments.push({ label: "Sign up" });
  } else if (pathname.startsWith("/invite/")) {
    segments.push({ label: "Invite" });
  } else if (!workspaceId) {
    return null;
  } else if (pathname.endsWith("/settings/")) {
    segments.push({ label: "Settings" });
  } else if (pathname.endsWith("/settings/environments")) {
    segments.push({ label: "Environments" });
  } else if (pathname.endsWith("/settings/members")) {
    segments.push({ label: "Members" });
  } else if (pathname.endsWith("/connections")) {
    segments.push({ label: "Connections" });
  } else if (pathname.endsWith("/settings/alerts")) {
    segments.push({ label: "Alerts" });
  } else if (pathname.includes("/bookmarks")) {
    segments.push({ label: "Bookmarks" });
  } else if (environmentId) {
    if (queueName) {
      segments.push({
        label: "Queues",
        to: "/$workspaceId/$environmentId/queues",
        params: { workspaceId, environmentId },
      });
      segments.push({ label: decodeURIComponent(queueName) });
    } else if (/\/queues\/?$/.test(pathname)) {
      segments.push({ label: "Queues" });
    } else if (pathname.endsWith("/stats")) {
      segments.push({ label: "Stats" });
    } else {
      segments.push({ label: "Overview" });
    }
  }

  const showEnvironmentDropdown = !!workspaceId;

  if (!showEnvironmentDropdown && segments.length === 0) return null;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        {showEnvironmentDropdown && (
          <BreadcrumbItem>
            <EnvironmentDropdown
              workspaceId={workspaceId!}
              environmentId={environmentId!}
            />
          </BreadcrumbItem>
        )}

        {segments.map((segment, index) => (
          <span key={`${segment.label}-${index}`} className="contents">
            {(showEnvironmentDropdown || index > 0) && (
              <BreadcrumbSeparator className="hidden md:block" />
            )}
            <BreadcrumbItem className={index === 0 && !showEnvironmentDropdown ? "hidden md:block" : undefined}>
              {!segment.to ? (
                <BreadcrumbPage className="truncate">{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={segment.to} params={segment.params} className="truncate">
                    {segment.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
