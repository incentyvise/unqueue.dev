import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { z } from "zod";
import {
  ActivityIcon,
  BarChart2Icon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  GaugeIcon,
  InboxIcon,
  SearchIcon,
  XCircleIcon,
  TrendingDownIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { rpcClient } from "@/lib/api";
import {
  environmentQueuesQueryOptions,
  environmentRedisQueryOptions,
} from "@/lib/environment-queues-query";
import { useEnvironmentQueueSync } from "@/hooks/use-environment-queue-sync";
import type { EnvironmentQueueRow } from "@/components/environment-queues-table";
import type { QueueMetrics } from "@unqueue/bullmq";
import { QueueStatusChip, type QueueStatus } from "@/components/queue-status-chip";
import { RedisIcon } from "@/components/icons/redis";
import { ScrollArea } from "@unqueue/ui/components/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RoutePending } from "@/lib/route-pending";
import { useQueueMetricsLive } from "@/hooks/use-queue-metrics-live";
import { queueKey } from "@/lib/queue-health";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EnvironmentHistoryCharts } from "@/components/environment-history-charts";

const RANGES = [
  { key: "1h", label: "1H", hours: 1 },
  { key: "6h", label: "6H", hours: 6 },
  { key: "24h", label: "24H", hours: 24 },
  { key: "7d", label: "7D", hours: 168 },
  { key: "30d", label: "30D", hours: 720 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export const Route = createFileRoute("/$workspaceId/$environmentId/stats")({
  validateSearch: z.object({
    range: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
  }),
  pendingComponent: RoutePending,
  component: StatsPage,
});

// ─── formatting ──────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtRate(r: number) {
  const pct = r * 100;
  return `${pct < 0.1 && pct > 0 ? "<0.1" : pct.toFixed(1)}%`;
}

function fmtMs(ms: number) {
  if (ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtThroughput(n: number) {
  if (n === 0) return "0/min";
  if (n < 0.1) return "<0.1/min";
  return `${n.toFixed(1)}/min`;
}

// ─── summary cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: "default" | "blue" | "amber" | "destructive" | "emerald";
  loading?: boolean;
}) {
  const valueClass = {
    default: "",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    destructive: "text-destructive",
    emerald: "text-emerald-600 dark:text-emerald-400",
  }[tone];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <p
            className={cn(
              "text-xl font-semibold tabular-nums tracking-tight",
              valueClass,
            )}
          >
            {value}
          </p>
        )}
        {sub && !loading && (
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── table helpers ────────────────────────────────────────────────────────────

const thCls =
  "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
const tdCls = "px-3 py-2.5 align-middle";

function NumCell({
  value,
  tone,
}: {
  value: string;
  tone?: "blue" | "amber" | "destructive" | "muted";
}) {
  return (
    <td
      className={cn(
        tdCls,
        "text-right font-mono text-[11px] tabular-nums",
        tone === "blue" && "text-blue-600 dark:text-blue-400",
        tone === "amber" && "text-amber-600 dark:text-amber-400",
        tone === "destructive" && "font-medium text-destructive",
        tone === "muted" && "text-muted-foreground",
        !tone && "text-foreground",
      )}
    >
      {value}
    </td>
  );
}

// ─── per-instance section ─────────────────────────────────────────────────────

type RedisInstance = Awaited<ReturnType<typeof rpcClient.redis.list>>[number];

function instanceAgg(
  queues: EnvironmentQueueRow[],
  liveMetrics: Record<string, QueueMetrics>,
) {
  let active = 0,
    waiting = 0,
    delayed = 0,
    failed = 0,
    throughput = 0,
    completedInWindow = 0,
    processedInWindow = 0;

  for (const q of queues) {
    active += q.counts.active;
    waiting += q.counts.waiting;
    delayed += q.counts.delayed;
    failed += q.counts.failed;
    const m = liveMetrics[`${q.redisInstanceId}:${q.name}`];
    if (m) {
      throughput += m.throughputPerMinute;
      completedInWindow += m.completedInWindow;
      processedInWindow += m.totalInWindow;
    }
  }

  const failureRate =
    processedInWindow > 0
      ? (processedInWindow - completedInWindow) / processedInWindow
      : null;

  return {
    active,
    backlog: waiting + delayed,
    failed,
    throughput,
    failureRate,
  };
}

function InstanceSection({
  redis,
  queues,
  liveMetrics,
  workspaceId,
  environmentId,
}: {
  redis: RedisInstance;
  queues: EnvironmentQueueRow[];
  liveMetrics: Record<string, QueueMetrics>;
  workspaceId: string;
  environmentId: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const agg = useMemo(
    () => instanceAgg(queues, liveMetrics),
    [queues, liveMetrics],
  );

  const metricsReady = queues.some(
    (q) => liveMetrics[`${q.redisInstanceId}:${q.name}`] !== undefined,
  );

  const isConnected = redis.status === "connected";

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            isConnected ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
        <RedisIcon className="size-3.5 shrink-0 text-red-500" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {redis.nickname || "Unnamed instance"}
          </span>
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {queues.length} queue{queues.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-4 font-mono text-[11px] tabular-nums">
          {agg.active > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              {fmt(agg.active)} active
            </span>
          )}
          {agg.backlog > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {fmt(agg.backlog)} backlog
            </span>
          )}
          {agg.failed > 0 && (
            <span className="text-destructive">{fmt(agg.failed)} failed</span>
          )}
          <span className="text-muted-foreground">
            {metricsReady ? fmtThroughput(agg.throughput) : "—"}
          </span>
        </div>

        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && queues.length === 0 && (
        <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
          No queues discovered yet.
        </div>
      )}

      {expanded && queues.length > 0 && (
        <table className="w-full text-xs">
          <thead className="bg-muted/20">
            <tr className="border-b border-border text-left">
              <th className={cn(thCls, "pl-4")}>Queue</th>
              <th className={cn(thCls, "text-right")}>Waiting</th>
              <th className={cn(thCls, "text-right")}>Active</th>
              <th className={cn(thCls, "text-right")}>Delayed</th>
              <th className={cn(thCls, "text-right")}>Failed</th>
              <th className={cn(thCls, "text-right")}>Throughput</th>
              <th className={cn(thCls, "text-right")}>Fail rate</th>
              <th className={cn(thCls, "text-right")}>P95</th>
              <th className={cn(thCls, "pr-4")}>Status</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((queue) => {
              const key = `${queue.redisInstanceId}:${queue.name}`;
              const m = liveMetrics[key];
              return (
                <tr
                  key={key}
                  className="border-b border-border/60 text-xs last:border-0 hover:bg-muted/20"
                >
                  <td className={cn(tdCls, "pl-4")}>
                    <Link
                      to="/$workspaceId/$environmentId/queues/$queueName"
                      params={{ workspaceId, environmentId, queueName: queue.name }}
                      search={{ redisInstanceId: queue.redisInstanceId }}
                      className="block max-w-[14rem] truncate font-mono font-medium hover:underline"
                    >
                      {queue.name}
                    </Link>
                  </td>
                  <NumCell
                    value={fmt(queue.counts.waiting)}
                    tone={queue.counts.waiting > 0 ? undefined : "muted"}
                  />
                  <NumCell
                    value={fmt(queue.counts.active)}
                    tone={queue.counts.active > 0 ? "blue" : "muted"}
                  />
                  <NumCell
                    value={fmt(queue.counts.delayed)}
                    tone={queue.counts.delayed > 0 ? "amber" : "muted"}
                  />
                  <NumCell
                    value={fmt(queue.counts.failed)}
                    tone={queue.counts.failed > 0 ? "destructive" : "muted"}
                  />
                  <td
                    className={cn(
                      tdCls,
                      "text-right font-mono text-[11px] tabular-nums text-muted-foreground",
                    )}
                  >
                    {m ? fmtThroughput(m.throughputPerMinute) : "—"}
                  </td>
                  <td
                    className={cn(
                      tdCls,
                      "text-right font-mono text-[11px] tabular-nums",
                      m && m.failureRate >= 0.05
                        ? "text-destructive"
                        : m && m.failureRate > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {m ? fmtRate(m.failureRate) : "—"}
                  </td>
                  <td
                    className={cn(
                      tdCls,
                      "text-right font-mono text-[11px] tabular-nums text-muted-foreground",
                    )}
                  >
                    {m ? fmtMs(m.p95RuntimeMs) : "—"}
                  </td>
                  <td className={cn(tdCls, "pr-4")}>
                    <QueueStatusChip
                      status={
                        (queue.isPaused ? "paused" : "running") as QueueStatus
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── leaderboards ─────────────────────────────────────────────────────────────

type LeaderRow = { queue: EnvironmentQueueRow; value: number; label: string };

function Leaderboard({
  title,
  icon: Icon,
  rows,
  empty,
  tone,
  workspaceId,
  environmentId,
}: {
  title: string;
  icon: LucideIcon;
  rows: LeaderRow[];
  empty: string;
  tone: "destructive" | "amber" | "blue";
  workspaceId: string;
  environmentId: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const bar = {
    destructive: "bg-destructive/15",
    amber: "bg-amber-500/15",
    blue: "bg-blue-500/15",
  }[tone];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-0.5 p-1.5">
          {rows.map((row, i) => (
            <li key={queueKey(row.queue)}>
              <Link
                to="/$workspaceId/$environmentId/queues/$queueName"
                params={{ workspaceId, environmentId, queueName: row.queue.name }}
                search={{ redisInstanceId: row.queue.redisInstanceId }}
                className="relative flex items-center gap-2 overflow-hidden rounded-md px-2.5 py-1.5 text-xs hover:bg-muted/50"
              >
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-md", bar)}
                  style={{ width: `${(row.value / max) * 100}%` }}
                  aria-hidden
                />
                <span className="relative w-4 text-[10px] text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="relative min-w-0 flex-1 truncate font-mono">
                  {row.queue.name}
                </span>
                <span className="relative font-mono tabular-nums">{row.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function csvEscape(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(
  queues: EnvironmentQueueRow[],
  metrics: Record<string, QueueMetrics>,
  redisNames: Map<string, string>,
) {
  const header = [
    "connection",
    "queue",
    "paused",
    "waiting",
    "active",
    "delayed",
    "failed",
    "completed",
    "workers",
    "throughput_per_min_5m",
    "failure_rate_5m",
    "p95_runtime_ms_5m",
    "p95_wait_ms_5m",
  ];
  const lines = queues.map((q) => {
    const m = metrics[queueKey(q)];
    return [
      redisNames.get(q.redisInstanceId) ?? q.redisInstanceId,
      q.name,
      q.isPaused ? "yes" : "no",
      q.counts.waiting,
      q.counts.active,
      q.counts.delayed,
      q.counts.failed,
      q.counts.completed,
      q.workers,
      m ? m.throughputPerMinute.toFixed(3) : "",
      m ? m.failureRate.toFixed(4) : "",
      m ? Math.round(m.p95RuntimeMs) : "",
      m ? Math.round(m.p95WaitMs) : "",
    ]
      .map(csvEscape)
      .join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unqueue-stats-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── page ─────────────────────────────────────────────────────────────────────

function StatsPage() {
  const { workspaceId, environmentId } = Route.useParams();
  const { range: rangeParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const range: RangeKey = rangeParam ?? "24h";
  const rangeHours = RANGES.find((r) => r.key === range)!.hours;
  const [filter, setFilter] = useState("");

  const historyQuery = useQuery({
    queryKey: ["env-history", environmentId, rangeHours],
    queryFn: () =>
      rpcClient.stats.getEnvironmentHistory({ environmentId, hours: rangeHours }),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const redisQuery = useQuery(environmentRedisQueryOptions(environmentId));
  const queuesQuery = useQuery(environmentQueuesQueryOptions(environmentId));

  const queues = useMemo(() => queuesQuery.data ?? [], [queuesQuery.data]);
  const redisInstances = useMemo(
    () => redisQuery.data ?? [],
    [redisQuery.data],
  );
  const redisInstanceIds = useMemo(
    () => redisInstances.map((i) => i.id),
    [redisInstances],
  );

  useEnvironmentQueueSync(environmentId, queues, redisInstanceIds);
  const liveMetrics = useQueueMetricsLive(queues);

  const redisNames = useMemo(
    () => new Map(redisInstances.map((r) => [r.id, r.nickname || "Unnamed"])),
    [redisInstances],
  );

  const leaderboards = useMemo(() => {
    const withMetrics = queues.map((queue) => ({
      queue,
      m: liveMetrics[queueKey(queue)],
    }));
    const failing = withMetrics
      .filter(({ m }) => m && m.totalInWindow > 0 && m.failureRate > 0)
      .sort((a, b) => b.m!.failureRate - a.m!.failureRate)
      .slice(0, 5)
      .map(({ queue, m }) => ({
        queue,
        value: m!.failureRate,
        label: fmtRate(m!.failureRate),
      }));
    const slowest = withMetrics
      .filter(({ m }) => m && m.p95RuntimeMs > 0)
      .sort((a, b) => b.m!.p95RuntimeMs - a.m!.p95RuntimeMs)
      .slice(0, 5)
      .map(({ queue, m }) => ({
        queue,
        value: m!.p95RuntimeMs,
        label: fmtMs(m!.p95RuntimeMs),
      }));
    const busiest = withMetrics
      .filter(({ m }) => m && m.throughputPerMinute > 0)
      .sort((a, b) => b.m!.throughputPerMinute - a.m!.throughputPerMinute)
      .slice(0, 5)
      .map(({ queue, m }) => ({
        queue,
        value: m!.throughputPerMinute,
        label: fmtThroughput(m!.throughputPerMinute),
      }));
    return { failing, slowest, busiest };
  }, [queues, liveMetrics]);

  const filteredQueues = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? queues.filter((q) => q.name.toLowerCase().includes(needle)) : queues;
  }, [queues, filter]);

  const queuesByInstance = useMemo(() => {
    const map = new Map<string, EnvironmentQueueRow[]>();
    for (const q of filteredQueues) {
      const arr = map.get(q.redisInstanceId) ?? [];
      arr.push(q);
      map.set(q.redisInstanceId, arr);
    }
    return map;
  }, [filteredQueues]);

  const summary = useMemo(() => {
    let totalActive = 0,
      totalWaiting = 0,
      totalDelayed = 0,
      totalFailed = 0,
      totalThroughput = 0,
      totalCompleted = 0,
      totalProcessed = 0;

    for (const q of queues) {
      totalActive += q.counts.active;
      totalWaiting += q.counts.waiting;
      totalDelayed += q.counts.delayed;
      totalFailed += q.counts.failed;
      const m = liveMetrics[queueKey(q)];
      if (m) {
        totalThroughput += m.throughputPerMinute;
        totalCompleted += m.completedInWindow;
        totalProcessed += m.totalInWindow;
      }
    }

    const failureRate =
      totalProcessed > 0
        ? (totalProcessed - totalCompleted) / totalProcessed
        : null;

    return {
      totalActive,
      backlog: totalWaiting + totalDelayed,
      totalFailed,
      totalThroughput,
      failureRate,
    };
  }, [queues, liveMetrics]);

  const isLoading = redisQuery.isLoading || queuesQuery.isLoading;
  const metricsReady = Object.keys(liveMetrics).length > 0;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-medium">
            <BarChart2Icon className="size-4 text-muted-foreground" />
            Stats
          </h1>
          <p className="text-xs text-muted-foreground">
            Throughput, failures and latency across {redisInstances.length}{" "}
            {redisInstances.length === 1 ? "connection" : "connections"}
          </p>
        </div>
        <div
          className="flex items-center rounded-lg border bg-muted/30 p-0.5"
          role="tablist"
          aria-label="Time range"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() =>
                void navigate({
                  search: { range: r.key === "24h" ? undefined : r.key },
                  replace: true,
                })
              }
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors",
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={queues.length === 0}
          onClick={() => exportCsv(queues, liveMetrics, redisNames)}
        >
          <DownloadIcon />
          Export CSV
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-7xl space-y-4 p-4">
          {queues.length > 0 && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <SummaryCard
                label="Active"
                value={fmt(summary.totalActive)}
                sub="currently processing"
                icon={ActivityIcon}
                tone={summary.totalActive > 0 ? "blue" : "default"}
                loading={isLoading}
              />
              <SummaryCard
                label="Backlog"
                value={fmt(summary.backlog)}
                sub="waiting + delayed"
                icon={ClockIcon}
                tone={summary.backlog > 100 ? "amber" : "default"}
                loading={isLoading}
              />
              <SummaryCard
                label="Throughput"
                value={metricsReady ? fmtThroughput(summary.totalThroughput) : "—"}
                sub="across all queues · 5m"
                icon={ZapIcon}
                loading={isLoading}
              />
              <SummaryCard
                label="Failure rate"
                value={
                  metricsReady && summary.failureRate != null
                    ? fmtRate(summary.failureRate)
                    : "—"
                }
                sub="5m window"
                icon={TrendingDownIcon}
                tone={
                  summary.failureRate == null
                    ? "default"
                    : summary.failureRate >= 0.05
                      ? "destructive"
                      : summary.failureRate > 0
                        ? "amber"
                        : "emerald"
                }
                loading={isLoading}
              />
            </div>
          )}

          {redisInstances.length > 0 && (
            <EnvironmentHistoryCharts
              points={historyQuery.data?.points ?? []}
              rangeHours={rangeHours}
              isLoading={historyQuery.isLoading}
            />
          )}

          {queues.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Leaderboard
                title="Highest failure rate · 5m"
                icon={XCircleIcon}
                rows={leaderboards.failing}
                empty="No failures in the last 5 minutes 🎉"
                tone="destructive"
                workspaceId={workspaceId}
                environmentId={environmentId}
              />
              <Leaderboard
                title="Slowest P95 runtime · 5m"
                icon={GaugeIcon}
                rows={leaderboards.slowest}
                empty="No completed jobs in the last 5 minutes"
                tone="amber"
                workspaceId={workspaceId}
                environmentId={environmentId}
              />
              <Leaderboard
                title="Busiest queues · 5m"
                icon={ZapIcon}
                rows={leaderboards.busiest}
                empty="Nothing processed in the last 5 minutes"
                tone="blue"
                workspaceId={workspaceId}
                environmentId={environmentId}
              />
            </div>
          )}

          {queues.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <h2 className="text-sm font-medium">Per-queue breakdown</h2>
              <div className="relative w-56">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter queues"
                  className="h-8 pl-8 text-xs"
                  aria-label="Filter queues"
                />
              </div>
            </div>
          )}

          {redisInstances.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border py-16 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <InboxIcon className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No Redis instances</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Connect a Redis instance in Settings to start monitoring queues.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {redisInstances.map((redis) => (
                <InstanceSection
                  key={redis.id}
                  redis={redis}
                  queues={queuesByInstance.get(redis.id) ?? []}
                  liveMetrics={liveMetrics}
                  workspaceId={workspaceId}
                  environmentId={environmentId}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
