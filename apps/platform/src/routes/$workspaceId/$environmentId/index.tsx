import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  ActivityIcon,
  ArrowRightIcon,
  ClockIcon,
  InboxIcon,
  RefreshCwIcon,
  TrendingDownIcon,
  ZapIcon,
} from "lucide-react";
import { rpcClient } from "@/lib/api";
import {
  aggregateQueueStats,
  getAttentionQueues,
} from "@/lib/aggregate-queue-stats";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@unqueue/ui/components/scroll-area";
import { EnvironmentQueuesTable } from "@/components/environment-queues-table";
import {
  EnvironmentAttentionQueues,
  EnvironmentJobStateBreakdown,
} from "@/components/environment-overview-stats";
import {
  EnvironmentOverviewContentSkeleton,
  EnvironmentOverviewHeaderSkeleton,
} from "@/components/environment-overview-skeleton";
import {
  HealthHero,
  KpiCard,
  OnboardingChecklist,
} from "@/components/overview-widgets";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@unqueue/ui/components/card";
import { RoutePending } from "@/lib/route-pending";
import { RedisConnectionSheet } from "@/components/redis-connection-sheet";
import {
  environmentQueuesForceRefreshOptions,
  environmentQueuesQueryOptions,
  environmentRedisQueryOptions,
} from "@/lib/environment-queues-query";
import { getQueueHealth, queueKey } from "@/lib/queue-health";
import { usePinnedQueues } from "@/lib/pinned-queues";
import { useEnvironmentQueueSync } from "@/hooks/use-environment-queue-sync";
import { useQueueMetricsLive } from "@/hooks/use-queue-metrics-live";
import { useShellContext } from "@/hooks/use-shell-context";

export const Route = createFileRoute("/$workspaceId/$environmentId/")({
  pendingComponent: RoutePending,
  component: EnvironmentOverview,
});

const SKELETON_ROWS = 8;
const TOP_QUEUES = 8;

function fmtCount(n: number) {
  return Math.round(n).toLocaleString();
}

function fmtPerMin(n: number | null) {
  if (n == null) return "—";
  if (n === 0) return "0";
  if (n < 0.1) return "<0.1";
  return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function fmtRate(r: number | null) {
  if (r == null) return "—";
  const pct = r * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function EnvironmentOverview() {
  const { workspaceId, environmentId } = Route.useParams();
  const { workspaceRole } = useShellContext();
  const queryClient = useQueryClient();
  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);

  const canManage = workspaceRole === "owner" || workspaceRole === "admin";

  const envsQuery = useQuery({
    queryKey: ["environments", workspaceId],
    queryFn: () => rpcClient.environment.list({ workspaceId }),
  });
  const environment = envsQuery.data?.find((e) => e.id === environmentId);

  const redisQuery = useQuery(environmentRedisQueryOptions(environmentId));
  const queuesQuery = useQuery(environmentQueuesQueryOptions(environmentId));

  const historyQuery = useQuery({
    queryKey: ["env-history", environmentId, 1],
    queryFn: () =>
      rpcClient.stats.getEnvironmentHistory({ environmentId, hours: 1 }),
    refetchInterval: 60_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts", environmentId],
    queryFn: () => rpcClient.alert.list({ environmentId }),
  });

  const membersQuery = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => rpcClient.members.list({ workspaceId }),
  });

  const queues = useMemo(() => queuesQuery.data ?? [], [queuesQuery.data]);
  const redisInstances = useMemo(() => redisQuery.data ?? [], [redisQuery.data]);
  const redisInstanceIds = useMemo(
    () => redisInstances.map((instance) => instance.id),
    [redisInstances],
  );
  const connectedCount = redisInstances.filter(
    (i) => i.status === "connected",
  ).length;
  const isLoading = redisQuery.isLoading;
  const queuesLoading = queuesQuery.isLoading;
  const isFetching =
    redisQuery.isFetching || queuesQuery.isFetching || forceRefreshing;

  const stats = aggregateQueueStats(queues);
  const attentionQueues = getAttentionQueues(queues);

  useEnvironmentQueueSync(environmentId, queues, redisInstanceIds);
  const liveMetrics = useQueueMetricsLive(queues);
  const { pinned } = usePinnedQueues(environmentId);

  const live = useMemo(() => {
    let throughput = 0;
    let completed = 0;
    let total = 0;
    let have = 0;
    for (const q of queues) {
      const m = liveMetrics[queueKey(q)];
      if (!m) continue;
      have++;
      throughput += m.throughputPerMinute;
      completed += m.completedInWindow;
      total += m.totalInWindow;
    }
    return {
      ready: have > 0,
      throughput: have > 0 ? throughput : null,
      failureRate: total > 0 ? (total - completed) / total : have > 0 ? 0 : null,
    };
  }, [queues, liveMetrics]);

  const series = useMemo(() => {
    const points = historyQuery.data?.points ?? [];
    return {
      throughput: points.map((p) => p.throughput),
      failureRate: points.map((p) => p.failureRate),
      backlog: points.map((p) => p.backlog),
      active: points.map((p) => p.active),
    };
  }, [historyQuery.data]);

  const healthCounts = useMemo(() => {
    const counts = { failed: 0, paused: 0, backlog: 0 };
    for (const q of queues) {
      const h = getQueueHealth(q);
      if (h === "failed" || h === "paused" || h === "backlog") counts[h]++;
    }
    return counts;
  }, [queues]);

  const topQueues = useMemo(() => {
    const score = (q: (typeof queues)[number]) =>
      (pinned.has(queueKey(q)) ? 1e12 : 0) +
      q.counts.failed * 1000 +
      q.counts.active * 100 +
      q.counts.waiting +
      q.counts.delayed;
    return [...queues].sort((a, b) => score(b) - score(a)).slice(0, TOP_QUEUES);
  }, [queues, pinned]);

  const totalWorkers = queues.reduce((sum, q) => sum + q.workers, 0);

  const refresh = async () => {
    setForceRefreshing(true);
    try {
      await Promise.all([
        redisQuery.refetch(),
        historyQuery.refetch(),
        queryClient.fetchQuery(
          environmentQueuesForceRefreshOptions(environmentId),
        ),
      ]);
    } finally {
      setForceRefreshing(false);
    }
  };

  const showChecklist =
    !isLoading &&
    !alertsQuery.isLoading &&
    !membersQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          {envsQuery.isLoading ? (
            <EnvironmentOverviewHeaderSkeleton />
          ) : (
            <>
              <h1 className="truncate font-medium">
                {environment?.name ?? "Overview"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Live health of every queue in this environment
              </p>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          disabled={isFetching}
        >
          <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-7xl space-y-4 p-4">
          {showChecklist && (
            <OnboardingChecklist
              workspaceId={workspaceId}
              hasConnection={redisInstances.length > 0}
              hasQueue={queues.length > 0}
              hasAlert={(alertsQuery.data?.length ?? 0) > 0}
              hasTeammate={(membersQuery.data?.length ?? 0) > 1}
              canManage={canManage}
              onAddConnection={() => setConnectionSheetOpen(true)}
            />
          )}

          {isLoading ? (
            <EnvironmentOverviewContentSkeleton tableRows={SKELETON_ROWS} />
          ) : redisInstances.length === 0 ? null : (
            <>
              <HealthHero
                workspaceId={workspaceId}
                environmentId={environmentId}
                summary={{
                  offlineConnections: redisInstances.length - connectedCount,
                  totalConnections: redisInstances.length,
                  failingQueues: healthCounts.failed,
                  pausedQueues: healthCounts.paused,
                  backlogQueues: healthCounts.backlog,
                  queueCount: queues.length,
                  throughputPerMin: live.throughput,
                }}
              />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Throughput"
                  value={`${fmtPerMin(live.throughput)}/min`}
                  hint="Jobs finished · last 5 min"
                  icon={ZapIcon}
                  series={series.throughput}
                  isLoading={queuesLoading}
                />
                <KpiCard
                  label="Failure rate"
                  value={fmtRate(live.failureRate)}
                  hint={`${fmtCount(stats.totals.failed)} failed jobs kept in Redis`}
                  icon={TrendingDownIcon}
                  series={series.failureRate}
                  tone={
                    live.failureRate == null
                      ? "default"
                      : live.failureRate >= 0.05
                        ? "destructive"
                        : live.failureRate > 0
                          ? "warning"
                          : "success"
                  }
                  isLoading={queuesLoading}
                />
                <KpiCard
                  label="Backlog"
                  value={fmtCount(stats.backlog)}
                  hint={`${fmtCount(stats.totals.waiting)} waiting · ${fmtCount(stats.totals.delayed)} delayed`}
                  icon={ClockIcon}
                  series={series.backlog}
                  tone={stats.backlog >= 100 ? "warning" : "default"}
                  isLoading={queuesLoading}
                />
                <KpiCard
                  label="Active now"
                  value={fmtCount(stats.totals.active)}
                  hint={`${fmtCount(totalWorkers)} ${totalWorkers === 1 ? "worker" : "workers"} · ${connectedCount}/${redisInstances.length} Redis up`}
                  icon={ActivityIcon}
                  series={series.active}
                  tone={stats.totals.active > 0 ? "blue" : "default"}
                  isLoading={queuesLoading}
                />
              </div>

              <EnvironmentJobStateBreakdown stats={stats} />

              <EnvironmentAttentionQueues
                queues={attentionQueues}
                workspaceId={workspaceId}
                environmentId={environmentId}
              />

              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-medium">
                      {queues.length > TOP_QUEUES ? "Busiest queues" : "Queues"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {queuesLoading
                        ? "Discovering queues..."
                        : queues.length === 0
                          ? "No queues discovered yet"
                          : `${queues.length.toLocaleString()} ${queues.length === 1 ? "queue" : "queues"} · ${stats.totalJobs.toLocaleString()} jobs`}
                    </p>
                  </div>
                  {queues.length > 0 && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/$workspaceId/$environmentId/queues"
                        params={{ workspaceId, environmentId }}
                      >
                        View all
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {queues.length === 0 && !queuesLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                        <InboxIcon className="size-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">No queues found</p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        BullMQ queues will appear here once workers start using
                        this Redis connection.
                      </p>
                    </div>
                  ) : (
                    <EnvironmentQueuesTable
                      queues={topQueues}
                      workspaceId={workspaceId}
                      environmentId={environmentId}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </ScrollArea>

      <RedisConnectionSheet
        open={connectionSheetOpen}
        onOpenChange={setConnectionSheetOpen}
        mode="create"
        environmentId={environmentId}
        canManage={canManage}
        onSuccess={() => {
          setConnectionSheetOpen(false);
          void queryClient.invalidateQueries({
            queryKey: ["redis", environmentId],
          });
        }}
      />
    </div>
  );
}
