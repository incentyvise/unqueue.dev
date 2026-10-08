import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentQueuesTableHeader } from "@/components/environment-queues-table";
import { JOB_STATE_META } from "@/lib/aggregate-queue-stats";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@unqueue/ui/components/card";

const tdClass = "px-3 py-2";

const thClass =
  "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

const STAT_LABELS = [
  "Throughput",
  "Failure rate",
  "Backlog",
  "Active now",
] as const;

function StatCardSkeleton({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function EnvironmentOverviewStatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STAT_LABELS.map((label) => (
        <StatCardSkeleton key={label} label={label} />
      ))}
    </div>
  );
}

function EnvironmentJobStateBreakdownSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Job distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {JOB_STATE_META.map((state) => (
            <div
              key={state.key}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span className={cn("size-2 rounded-full opacity-40", state.barClass)} />
              <span>{state.label}</span>
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EnvironmentAttentionQueuesTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
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
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            <td className={cn(tdClass, "pl-4")}>
              <Skeleton className="h-3.5 w-32" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-10" />
            </td>
            <td className={cn(tdClass, "pr-4")}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EnvironmentAttentionQueuesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Needs attention</CardTitle>
        <p className="text-xs text-muted-foreground">
          Paused queues, failures, or backlog of 10+ jobs
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        <EnvironmentAttentionQueuesTableSkeleton rows={rows} />
      </CardContent>
    </Card>
  );
}

export function EnvironmentQueuesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <table className="w-full text-xs">
      <EnvironmentQueuesTableHeader />
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            <td className={cn(tdClass, "pl-4")}>
              <Skeleton className="h-3.5 w-32" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={tdClass}>
              <Skeleton className="ml-auto h-3.5 w-8" />
            </td>
            <td className={cn(tdClass, "pr-4")}>
              <Skeleton className="h-5 w-16 rounded-full" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EnvironmentOverviewHeaderSkeleton() {
  return (
    <div className="space-y-1">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-3.5 w-48" />
    </div>
  );
}

export function EnvironmentOverviewContentSkeleton({
  tableRows = 8,
  attentionRows = 3,
}: {
  tableRows?: number;
  attentionRows?: number;
}) {
  return (
    <>
      <EnvironmentOverviewStatsSkeleton />
      <EnvironmentJobStateBreakdownSkeleton />
      <EnvironmentAttentionQueuesSkeleton rows={attentionRows} />
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="text-sm font-medium">All queues</CardTitle>
          <Skeleton className="h-3.5 w-40" />
        </CardHeader>
        <CardContent className="p-0">
          <EnvironmentQueuesTableSkeleton rows={tableRows} />
        </CardContent>
      </Card>
    </>
  );
}
