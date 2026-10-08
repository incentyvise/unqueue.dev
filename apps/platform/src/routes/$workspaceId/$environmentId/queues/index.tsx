import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  LayersIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { z } from "zod";
import type { QueueMetrics } from "@unqueue/bullmq";
import type { EnvironmentQueueRow } from "@/components/environment-queues-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/kbd";
import { RedisIcon } from "@/components/icons/redis";
import { useEnvironmentQueueSync } from "@/hooks/use-environment-queue-sync";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useQueueMetricsLive } from "@/hooks/use-queue-metrics-live";
import {
  environmentQueuesForceRefreshOptions,
  environmentQueuesQueryOptions,
  environmentRedisQueryOptions,
} from "@/lib/environment-queues-query";
import { usePinnedQueues } from "@/lib/pinned-queues";
import {
  getQueueHealth,
  QUEUE_HEALTH_META,
  queueKey,
  type QueueHealth,
} from "@/lib/queue-health";
import { queueFailureRate } from "@/lib/aggregate-queue-stats";
import { RoutePending } from "@/lib/route-pending";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "failed", "backlog", "paused", "active", "idle"] as const;
type Filter = (typeof FILTERS)[number];

const SORT_KEYS = [
  "name",
  "waiting",
  "active",
  "delayed",
  "failed",
  "failRate",
  "throughput",
  "workers",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

const searchSchema = z.object({
  q: z.string().optional(),
  filter: z.enum(FILTERS).optional(),
  sort: z.enum(SORT_KEYS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  redis: z.string().optional(),
});

export const Route = createFileRoute("/$workspaceId/$environmentId/queues/")({
  validateSearch: searchSchema,
  pendingComponent: RoutePending,
  component: QueuesPage,
});

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  failed: QUEUE_HEALTH_META.failed.label,
  backlog: QUEUE_HEALTH_META.backlog.label,
  paused: QUEUE_HEALTH_META.paused.label,
  active: QUEUE_HEALTH_META.active.label,
  idle: QUEUE_HEALTH_META.idle.label,
};

function sortValue(
  queue: EnvironmentQueueRow,
  key: SortKey,
  metrics: QueueMetrics | undefined,
): number | string {
  switch (key) {
    case "name":
      return queue.name.toLowerCase();
    case "failRate":
      return queueFailureRate(queue) ?? -1;
    case "throughput":
      return metrics?.throughputPerMinute ?? -1;
    case "workers":
      return queue.workers;
    default:
      return queue.counts[key];
  }
}

function fmtThroughput(m: QueueMetrics | undefined) {
  if (!m) return "—";
  const n = m.throughputPerMinute;
  if (n === 0) return "0/min";
  if (n < 0.1) return "<0.1/min";
  return `${n.toFixed(1)}/min`;
}

function fmtRate(rate: number | null) {
  if (rate == null) return "—";
  const pct = rate * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function QueuesPage() {
  const { workspaceId, environmentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);

  const query = search.q ?? "";
  const [queryInput, setQueryInput] = useState(query);

  useEffect(() => {
    if (queryInput === query) return;
    const timer = setTimeout(() => setSearch({ q: queryInput || undefined }), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  useEffect(() => {
    setQueryInput((current) => (current === query ? current : query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const filter = search.filter ?? "all";
  const sort = search.sort ?? "failed";
  const dir = search.dir ?? (sort === "name" ? "asc" : "desc");

  const redisQuery = useQuery(environmentRedisQueryOptions(environmentId));
  const queuesQuery = useQuery(environmentQueuesQueryOptions(environmentId));
  const queues = useMemo(() => queuesQuery.data ?? [], [queuesQuery.data]);
  const redisInstances = useMemo(() => redisQuery.data ?? [], [redisQuery.data]);
  const redisIds = useMemo(() => redisInstances.map((r) => r.id), [redisInstances]);
  const redisNames = useMemo(
    () => new Map(redisInstances.map((r) => [r.id, r.nickname || "Unnamed"])),
    [redisInstances],
  );

  useEnvironmentQueueSync(environmentId, queues, redisIds);
  const metrics = useQueueMetricsLive(queues);
  const { pinned, toggle: togglePin } = usePinnedQueues(environmentId);

  const healthCounts = useMemo(() => {
    const counts: Record<Filter, number> = {
      all: 0,
      failed: 0,
      backlog: 0,
      paused: 0,
      active: 0,
      idle: 0,
    };
    for (const q of queues) {
      if (search.redis && q.redisInstanceId !== search.redis) continue;
      counts.all++;
      counts[getQueueHealth(q)]++;
    }
    return counts;
  }, [queues, search.redis]);

  const rows = useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    const filtered = queues.filter((q) => {
      if (search.redis && q.redisInstanceId !== search.redis) return false;
      if (filter !== "all" && getQueueHealth(q) !== filter) return false;
      if (needle && !q.name.toLowerCase().includes(needle)) return false;
      return true;
    });
    const mult = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const pinA = pinned.has(queueKey(a)) ? 1 : 0;
      const pinB = pinned.has(queueKey(b)) ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      const va = sortValue(a, sort, metrics[queueKey(a)]);
      const vb = sortValue(b, sort, metrics[queueKey(b)]);
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name);
    });
  }, [queues, queryInput, filter, sort, dir, metrics, pinned, search.redis]);

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setSearch({ dir: dir === "asc" ? "desc" : "asc" });
    } else {
      setSearch({ sort: key, dir: key === "name" ? "asc" : "desc" });
    }
  };

  const openQueue = (queue: EnvironmentQueueRow) => {
    void navigate({
      to: "/$workspaceId/$environmentId/queues/$queueName",
      params: { workspaceId, environmentId, queueName: queue.name },
      search: { redisInstanceId: queue.redisInstanceId },
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.fetchQuery(environmentQueuesForceRefreshOptions(environmentId));
    } finally {
      setRefreshing(false);
    }
  };

  useHotkeys({
    "/": () => searchRef.current?.focus(),
    j: () => setFocusIndex((i) => Math.min(rows.length - 1, i + 1)),
    k: () => setFocusIndex((i) => Math.max(0, i - 1)),
    Enter: () => {
      const row = rows[focusIndex];
      if (row) openQueue(row);
    },
    p: () => {
      const row = rows[focusIndex];
      if (row) togglePin(queueKey(row));
    },
  });

  const isLoading = queuesQuery.isLoading || redisQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-medium">
            <LayersIcon className="size-4 text-muted-foreground" />
            Queues
          </h1>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Discovering queues…"
              : `${queues.length.toLocaleString()} ${queues.length === 1 ? "queue" : "queues"} across ${redisInstances.length} ${redisInstances.length === 1 ? "connection" : "connections"}`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
          Rediscover
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQueryInput("");
                e.currentTarget.blur();
              }
              if (e.key === "Enter" && rows[0]) openQueue(rows[0]);
            }}
            placeholder="Filter queues by name"
            className="h-8 pr-8 pl-8 text-xs"
            aria-label="Filter queues"
          />
          {queryInput ? (
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQueryInput("")}
              aria-label="Clear filter"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Health filter">
          {FILTERS.map((f) => {
            const active = filter === f;
            const count = healthCounts[f];
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSearch({ filter: f === "all" ? undefined : f })}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                  active
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {f !== "all" && (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      QUEUE_HEALTH_META[f as QueueHealth].dot,
                    )}
                  />
                )}
                {FILTER_LABEL[f]}
                <span className="font-mono tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {redisInstances.length > 1 && (
          <select
            value={search.redis ?? ""}
            onChange={(e) => setSearch({ redis: e.target.value || undefined })}
            className="ml-auto h-7 rounded-md border bg-background px-2 text-xs"
            aria-label="Filter by connection"
          >
            <option value="">All connections</option>
            {redisInstances.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nickname || "Unnamed"}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : queues.length === 0 ? (
          <EmptyState
            title={redisInstances.length === 0 ? "No connections yet" : "No queues discovered"}
            description={
              redisInstances.length === 0
                ? "Connect the Redis instance your BullMQ workers use and queues will show up here automatically."
                : "Queues appear as soon as a BullMQ producer or worker touches this Redis instance."
            }
            action={
              redisInstances.length === 0 ? (
                <Button size="sm" asChild>
                  <Link to="/$workspaceId/connections" params={{ workspaceId }}>
                    Add a connection
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void refresh()}>
                  <RefreshCwIcon />
                  Rediscover now
                </Button>
              )
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No queues match"
            description="Try a different name or health filter."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQueryInput("");
                  setSearch({ q: undefined, filter: undefined, redis: undefined });
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <table className="w-full min-w-[56rem] text-xs">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr className="border-b text-left">
                <th className="w-8 py-2 pl-4" />
                <SortHeader label="Queue" k="name" sort={sort} dir={dir} onSort={toggleSort} align="left" />
                <SortHeader label="Waiting" k="waiting" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Active" k="active" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Delayed" k="delayed" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Failed" k="failed" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Fail %" k="failRate" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Throughput" k="throughput" sort={sort} dir={dir} onSort={toggleSort} />
                <SortHeader label="Workers" k="workers" sort={sort} dir={dir} onSort={toggleSort} />
                <th className="w-8 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((queue, index) => {
                const key = queueKey(queue);
                const health = getQueueHealth(queue);
                const meta = QUEUE_HEALTH_META[health];
                const failRate = queueFailureRate(queue);
                const isPinned = pinned.has(key);
                const isFocused = index === focusIndex;
                return (
                  <tr
                    key={key}
                    onClick={() => openQueue(queue)}
                    onMouseEnter={() => setFocusIndex(index)}
                    className={cn(
                      "group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40",
                      isFocused && "bg-muted/40",
                    )}
                  >
                    <td className="py-2 pl-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(key);
                        }}
                        className={cn(
                          "flex items-center text-muted-foreground transition-opacity hover:text-amber-500",
                          isPinned ? "text-amber-500 opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        aria-label={isPinned ? "Unpin queue" : "Pin queue"}
                        title={isPinned ? "Unpin" : "Pin to top (p)"}
                      >
                        <StarIcon className={cn("size-3.5", isPinned && "fill-current")} />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", meta.dot)}
                          title={`${meta.label}: ${meta.description}`}
                        />
                        <span className="truncate font-mono font-medium">{queue.name}</span>
                        {queue.isPaused && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            Paused
                          </span>
                        )}
                        {redisInstances.length > 1 && (
                          <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:inline-flex">
                            <RedisIcon className="size-3" />
                            {redisNames.get(queue.redisInstanceId)}
                          </span>
                        )}
                      </div>
                    </td>
                    <NumCell value={queue.counts.waiting} tone={queue.counts.waiting >= 10 ? "sky" : undefined} />
                    <NumCell value={queue.counts.active} tone="blue" />
                    <NumCell value={queue.counts.delayed} tone="amber" />
                    <NumCell value={queue.counts.failed} tone="destructive" />
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono tabular-nums",
                        failRate == null || failRate === 0
                          ? "text-muted-foreground"
                          : failRate >= 0.05
                            ? "font-medium text-destructive"
                            : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {fmtRate(failRate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {fmtThroughput(metrics[key])}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono tabular-nums",
                        queue.workers === 0 && queue.counts.waiting > 0
                          ? "font-medium text-destructive"
                          : "text-muted-foreground",
                      )}
                      title={
                        queue.workers === 0 && queue.counts.waiting > 0
                          ? "Jobs are waiting but no workers are connected"
                          : undefined
                      }
                    >
                      {queue.workers}
                    </td>
                    <td className="pr-4 text-muted-foreground">
                      <ChevronRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="hidden shrink-0 items-center gap-3 border-t px-4 py-1.5 text-[11px] text-muted-foreground md:flex">
          <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="flex items-center gap-1"><Kbd>p</Kbd> pin</span>
          <span className="flex items-center gap-1"><Kbd>?</Kbd> all shortcuts</span>
          <span className="ml-auto tabular-nums">
            Showing {rows.length.toLocaleString()} of {queues.length.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  k,
  sort,
  dir,
  onSort,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === k;
  const Icon = dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-0")} />
      </button>
    </th>
  );
}

function NumCell({
  value,
  tone,
}: {
  value: number;
  tone?: "blue" | "amber" | "destructive" | "sky";
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-right font-mono tabular-nums",
        value === 0 && "text-muted-foreground/60",
        value > 0 && tone === "blue" && "text-blue-600 dark:text-blue-400",
        value > 0 && tone === "amber" && "text-amber-600 dark:text-amber-400",
        value > 0 && tone === "sky" && "text-sky-600 dark:text-sky-400",
        value > 0 && tone === "destructive" && "font-medium text-destructive",
      )}
    >
      {value.toLocaleString()}
    </td>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <LayersIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
