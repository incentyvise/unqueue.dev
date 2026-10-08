import { useState } from "react";
import { KeyboardIcon, MoonIcon, SunIcon } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { ErrorBoundary, SilentErrorBoundary } from "@/components/error-boundary";
import { NavSearch } from "@/components/nav-search";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { RealtimeStatusIndicator } from "@/components/nav-realtime-status";
import { RedisIcon } from "@/components/icons/redis";
import { ShellLayoutProvider, ShellProvider, useStatusBar } from "@/components/shell-context";
import { useTheme } from "@/components/theme-provider";
import { useShellContext } from "@/hooks/use-shell-context";
import { rpcClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { workspaceId, environmentId, hasNavigationContext } =
    useShellContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const envNav = (
    to:
      | "/$workspaceId/$environmentId"
      | "/$workspaceId/$environmentId/queues"
      | "/$workspaceId/$environmentId/stats",
  ) => {
    if (!workspaceId || !environmentId) return;
    void navigate({ to, params: { workspaceId, environmentId } });
  };

  useHotkeys(
    {
      "?": () => setShortcutsOpen(true),
      "g o": () => envNav("/$workspaceId/$environmentId"),
      "g q": () => envNav("/$workspaceId/$environmentId/queues"),
      "g s": () => envNav("/$workspaceId/$environmentId/stats"),
      "g b": () => {
        if (workspaceId) {
          void navigate({ to: "/$workspaceId/bookmarks", params: { workspaceId } });
        }
      },
    },
    { enabled: hasNavigationContext },
  );

  return (
    <ShellLayoutProvider>
      <ShellProvider
        value={{
          openCommandPalette: () => {
            if (hasNavigationContext) setCommandOpen(true);
          },
        }}
      >
        <TooltipProvider>
          <SidebarProvider>
            <SilentErrorBoundary>
              <AppSidebar
                workspaceId={workspaceId}
                environmentId={environmentId}
              />
            </SilentErrorBoundary>
            <SidebarInset className="flex h-svh flex-col overflow-hidden overscroll-none">
              <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
                <SidebarTrigger className="-ml-1" />
                <PageBreadcrumbs />
                {hasNavigationContext && (
                  <div className="ml-auto shrink-0">
                    <NavSearch />
                  </div>
                )}
              </header>
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-y-none">
                <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
              </main>
              {hasNavigationContext && (
                <AppStatusBar
                  environmentId={environmentId}
                  onShowShortcuts={() => setShortcutsOpen(true)}
                />
              )}
            </SidebarInset>
            {hasNavigationContext && workspaceId && environmentId && (
              <CommandPalette
                workspaceId={workspaceId}
                environmentId={environmentId}
                open={commandOpen}
                onOpenChange={setCommandOpen}
                onShowShortcuts={() => setShortcutsOpen(true)}
              />
            )}
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          </SidebarProvider>
        </TooltipProvider>
      </ShellProvider>
    </ShellLayoutProvider>
  );
}


function StatusBarSeparator() {
  return <span className="-my-2.5 self-stretch w-px shrink-0 bg-border" />;
}

function ThemeToggleIcon() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Light mode" : "Dark mode"}
      className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {isDark ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
    </button>
  );
}

function AppStatusBar({
  environmentId,
  onShowShortcuts,
}: {
  environmentId?: string;
  onShowShortcuts: () => void;
}) {
  const { slotContent } = useStatusBar();
  const { data: redisInstances } = useQuery({
    queryKey: ["redis", "clientCounts", environmentId],
    queryFn: () => rpcClient.redis.getClientCounts({ environmentId: environmentId! }),
    enabled: !!environmentId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
      <ThemeToggleIcon />
      <StatusBarSeparator />
      <RealtimeStatusIndicator />
      {slotContent && (
        <>
          <StatusBarSeparator />
          {slotContent}
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onShowShortcuts}
        className="hidden items-center gap-1 transition-colors hover:text-foreground md:flex"
        title="Keyboard shortcuts"
      >
        <KeyboardIcon className="size-3.5" />
        <span>?</span>
      </button>
      {redisInstances && redisInstances.length > 0 && (
        <>
          <StatusBarSeparator />
          <RedisIcon className="size-3 shrink-0" />
          {redisInstances.map((instance) => {
            const connected = instance.connectedClients !== null;
            return (
              <span key={instance.id} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    connected ? "bg-emerald-500 dark:bg-emerald-400" : "bg-muted-foreground/40",
                  )}
                />
                <span className="max-w-[10rem] truncate font-medium">{instance.nickname}</span>
                <span className="tabular-nums">{connected ? `${instance.connectedClients} conn` : "—"}</span>
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}
