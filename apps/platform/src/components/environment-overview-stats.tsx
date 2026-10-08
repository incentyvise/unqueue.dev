import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  JOB_STATE_META,
  queueFailureRate,
  type EnvironmentQueueStats,
  type AttentionQueue,
} from "@/lib/aggregate-queue-stats";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@unqueue/ui/components/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatFailureRate(rate: number | null) {
  if (rate == null) return "—";
  return `${Number((rate * 100).toPrecision(3))}%`;
}

export function EnvironmentJobStateBreakdown({
  stats,
  isLoading,
}: {
  stats: EnvironmentQueueStats;
  isLoading?: boolean;
}) {
  const segments = JOB_STATE_META.map((state) => ({
    ...state,
    count: stats.totals[state.key],
  })).filter((segment) => segment.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Job distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
          </>
        ) : stats.totalJobs === 0 ? (
          <p className="text-xs text-muted-foreground">No jobs across queues</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  className={cn("min-w-px", segment.barClass)}
                  style={{
                    width: `${(segment.count / stats.totalJobs) * 100}%`,
                  }}
                  title={`${segment.label}: ${formatCount(segment.count)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {JOB_STATE_META.map((state) => (
                <div
                  key={state.key}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className={cn("size-2 rounded-full", state.barClass)}
                  />
                  <span>{state.label}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCount(stats.totals[state.key])}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const thClass =
  "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
const tdClass = "px-3 py-2 align-middle text-[11px]";

export function EnvironmentAttentionQueues({
  queues,
  workspaceId,
  environmentId,
}: {
  queues: AttentionQueue[];
  workspaceId: string;
  environmentId: string;
}) {
  if (queues.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Needs attention</CardTitle>
        <p className="text-xs text-muted-foreground">
          Paused queues, failures, or backlog of 10+ jobs
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className={cn(thClass, "pl-4")}>Queue</th>
              <th className={cn(thClass, "text-right")}>Backlog</th>
              <th className={cn(thClass, "text-right")}>Failed</th>
              <th className={cn(thClass, "text-right")}>% Failed</th>
              <th className={cn(thClass, "text-right pr-4")}>Active</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((queue) => {
              const failureRate = queueFailureRate(queue);

              return (
              <tr
                key={`${queue.redisInstanceId}-${queue.name}`}
                className="border-b border-border/60 last:border-0"
              >
                <td className={cn(tdClass, "pl-4")}>
                  <Link
                    to="/$workspaceId/$environmentId/queues/$queueName"
                    params={{
                      workspaceId,
                      environmentId,
                      queueName: queue.name,
                    }}
                    search={{ redisInstanceId: queue.redisInstanceId }}
                    className="block max-w-[14rem] truncate font-mono font-medium hover:underline"
                  >
                    {queue.name}
                  </Link>
                </td>
                <td
                  className={cn(
                    tdClass,
                    "text-right font-mono tabular-nums",
                    queue.backlog >= 10 && "font-medium text-amber-600 dark:text-amber-400",
                  )}
                >
                  {formatCount(queue.backlog)}
                </td>
                <td
                  className={cn(
                    tdClass,
                    "text-right font-mono tabular-nums",
                    queue.counts.failed > 0 && "font-medium text-destructive",
                  )}
                >
                  {formatCount(queue.counts.failed)}
                </td>
                <td
                  className={cn(
                    tdClass,
                    "text-right font-mono tabular-nums",
                    failureRate != null &&
                      failureRate >= 0.2 &&
                      "font-medium text-destructive",
                    failureRate != null &&
                      failureRate >= 0.05 &&
                      failureRate < 0.2 &&
                      "font-medium text-amber-600 dark:text-amber-400",
                  )}
                >
                  {formatFailureRate(failureRate)}
                </td>
                <td className={cn(tdClass, "text-right pr-4 font-mono tabular-nums")}>
                  {formatCount(queue.counts.active)}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
