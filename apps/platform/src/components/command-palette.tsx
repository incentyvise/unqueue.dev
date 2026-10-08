import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart2Icon,
  BellIcon,
  BookmarkIcon,
  DatabaseZapIcon,
  KeyboardIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LinkIcon,
  MoonIcon,
  ServerIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@unqueue/ui/components/command";
import { Kbd } from "@/components/kbd";
import { useTheme } from "@/components/theme-provider";
import { environmentQueuesQueryOptions } from "@/lib/environment-queues-query";
import { getQueueHealth, QUEUE_HEALTH_META } from "@/lib/queue-health";
import { cn } from "@/lib/utils";

function PaletteItem({
  icon: Icon,
  label,
  keys,
  onSelect,
  value,
}: {
  icon: LucideIcon;
  label: string;
  keys?: string[];
  onSelect: () => void;
  value?: string;
}) {
  return (
    <CommandItem value={value ?? label} onSelect={onSelect}>
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {keys && (
        <span className="ml-auto flex items-center gap-0.5">
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </CommandItem>
  );
}

export function CommandPalette({
  workspaceId,
  environmentId,
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  workspaceId: string;
  environmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const { theme, toggleTheme } = useTheme();

  const queuesQuery = useQuery({
    ...environmentQueuesQueryOptions(environmentId),
    enabled: open,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const go = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  const queues = [...(queuesQuery.data ?? [])].sort(
    (a, b) => b.counts.failed - a.counts.failed || a.name.localeCompare(b.name),
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a queue, page, or action…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Queues">
          {queues.map((queue) => {
            const health = getQueueHealth(queue);
            return (
              <CommandItem
                key={`${queue.redisInstanceId}-${queue.name}`}
                value={`queue ${queue.name} ${queue.redisInstanceId}`}
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/$workspaceId/$environmentId/queues/$queueName",
                      params: {
                        workspaceId,
                        environmentId,
                        queueName: queue.name,
                      },
                      search: { redisInstanceId: queue.redisInstanceId },
                    }),
                  )
                }
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    QUEUE_HEALTH_META[health].dot,
                  )}
                />
                <span className="font-mono">{queue.name}</span>
                <span className="ml-auto flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                  {queue.counts.active > 0 && <span>{queue.counts.active} active</span>}
                  {queue.counts.waiting > 0 && <span>{queue.counts.waiting} waiting</span>}
                  {queue.counts.failed > 0 && (
                    <span className="text-destructive">{queue.counts.failed} failed</span>
                  )}
                  {queue.isPaused && <span className="text-amber-600 dark:text-amber-400">paused</span>}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Navigate">
          <PaletteItem
            icon={LayoutDashboardIcon}
            label="Overview"
            keys={["g", "o"]}
            onSelect={() =>
              go(() =>
                navigate({
                  to: "/$workspaceId/$environmentId",
                  params: { workspaceId, environmentId },
                }),
              )
            }
          />
          <PaletteItem
            icon={LayersIcon}
            label="Queues"
            keys={["g", "q"]}
            onSelect={() =>
              go(() =>
                navigate({
                  to: "/$workspaceId/$environmentId/queues",
                  params: { workspaceId, environmentId },
                }),
              )
            }
          />
          <PaletteItem
            icon={BarChart2Icon}
            label="Stats"
            keys={["g", "s"]}
            onSelect={() =>
              go(() =>
                navigate({
                  to: "/$workspaceId/$environmentId/stats",
                  params: { workspaceId, environmentId },
                }),
              )
            }
          />
          <PaletteItem
            icon={BookmarkIcon}
            label="Bookmarks"
            keys={["g", "b"]}
            onSelect={() =>
              go(() =>
                navigate({ to: "/$workspaceId/bookmarks", params: { workspaceId } }),
              )
            }
          />
          <PaletteItem
            icon={DatabaseZapIcon}
            label="Connections"
            onSelect={() =>
              go(() =>
                navigate({ to: "/$workspaceId/connections", params: { workspaceId } }),
              )
            }
          />
          <PaletteItem
            icon={BellIcon}
            label="Alerts"
            onSelect={() =>
              go(() =>
                navigate({ to: "/$workspaceId/settings/alerts", params: { workspaceId } }),
              )
            }
          />
          <PaletteItem
            icon={ServerIcon}
            label="Environments"
            onSelect={() =>
              go(() =>
                navigate({
                  to: "/$workspaceId/settings/environments",
                  params: { workspaceId },
                }),
              )
            }
          />
          <PaletteItem
            icon={UsersIcon}
            label="Members"
            onSelect={() =>
              go(() =>
                navigate({ to: "/$workspaceId/settings/members", params: { workspaceId } }),
              )
            }
          />
        </CommandGroup>
        <CommandGroup heading="Actions">
          <PaletteItem
            icon={theme === "dark" ? SunIcon : MoonIcon}
            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            value="toggle theme dark light mode"
            onSelect={() => go(toggleTheme)}
          />
          <PaletteItem
            icon={LinkIcon}
            label="Copy link to this page"
            onSelect={() =>
              go(() => {
                void navigator.clipboard
                  .writeText(new URL(href, window.location.origin).toString())
                  .then(() => toast.success("Link copied"));
              })
            }
          />
          <PaletteItem
            icon={KeyboardIcon}
            label="Keyboard shortcuts"
            keys={["?"]}
            onSelect={() => go(onShowShortcuts)}
          />
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
