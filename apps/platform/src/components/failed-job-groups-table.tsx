import { useState } from "react";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatJobTimestamp } from "@/lib/format-timestamp";
import { cn } from "@/lib/utils";
import type { FailedJobGroup } from "@unqueue/bullmq";

function share(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(1, count / total);
}

export function FailedJobGroupsTable({
  groups,
  totalFailed,
  isLoading,
  canWrite,
  onOpenJob,
  onRetryGroup,
  onRemoveGroup,
}: {
  groups: FailedJobGroup[];
  totalFailed: number;
  isLoading: boolean;
  canWrite: boolean;
  onOpenJob: (jobId: string) => void;
  onRetryGroup: (group: FailedJobGroup) => Promise<void>;
  onRemoveGroup: (group: FailedJobGroup) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-8 w-12" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-medium">No failures to triage</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Failed jobs are grouped here by job name and error, so one bad deploy shows up as one row instead of a thousand.
        </p>
      </div>
    );
  }

  const scanned = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          {groups.length.toLocaleString()} distinct {groups.length === 1 ? "error" : "errors"} across{" "}
          {scanned.toLocaleString()} failed {scanned === 1 ? "job" : "jobs"}
          {totalFailed > scanned &&
            ` (newest ${scanned.toLocaleString()} of ${totalFailed.toLocaleString()} — group actions apply to these)`}
        </span>
        <span className="hidden sm:inline">Grouped by job name + normalised message</span>
      </div>
      <ul className="divide-y divide-border/60">
        {groups.map((group) => {
          const isOpen = expanded === group.key;
          const first = formatJobTimestamp(group.firstFailedAt);
          const last = formatJobTimestamp(group.latestFailedAt);
          const pct = share(group.count, scanned);
          const busy = busyKey === group.key;

          return (
            <li key={group.key}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isOpen ? null : group.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded(isOpen ? null : group.key);
                  }
                }}
                className="group flex cursor-pointer items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                aria-expanded={isOpen}
              >
                <div className="flex w-14 shrink-0 flex-col items-end gap-1 pt-0.5">
                  <span className="font-mono text-base font-semibold leading-none text-destructive tabular-nums">
                    {group.count.toLocaleString()}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-destructive/70"
                      style={{ width: `${Math.max(4, pct * 100)}%` }}
                    />
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <ChevronRightIcon
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="truncate text-xs font-medium">{group.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {(pct * 100).toFixed(pct < 0.1 ? 1 : 0)}%
                    </span>
                  </div>
                  <p
                    className="truncate pl-5.5 font-mono text-[11px] text-destructive/90"
                    title={group.failedReason}
                  >
                    {group.failedReason ?? group.message}
                  </p>
                  <p className="pl-5.5 text-[11px] text-muted-foreground">
                    Last seen <span title={last.title}>{last.label}</span>
                    {group.count > 1 && (
                      <>
                        {" · "}first seen <span title={first.title}>{first.label}</span>
                      </>
                    )}
                  </p>
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenJob(group.latestJobId)}
                    title="Open the most recent failure"
                  >
                    <ExternalLinkIcon />
                    <span className="hidden md:inline">Latest</span>
                  </Button>
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy}
                        onClick={async () => {
                          setBusyKey(group.key);
                          try {
                            await onRetryGroup(group);
                          } finally {
                            setBusyKey(null);
                          }
                        }}
                      >
                        <RotateCcwIcon />
                        Retry {group.count > 1 ? "all" : ""}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveGroup(group)}
                        aria-label={`Remove ${group.count} failed jobs`}
                        title="Remove these failed jobs"
                      >
                        <Trash2Icon />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t border-border/40 bg-muted/20 px-4 py-3 pl-[5.5rem]">
                  {group.stacktrace?.[0] && (
                    <pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {group.stacktrace[0]}
                    </pre>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Affected jobs ({group.jobIds.length.toLocaleString()})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {group.jobIds.slice(0, 40).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onOpenJob(id)}
                          className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums hover:border-foreground/30 hover:bg-muted"
                        >
                          #{id}
                        </button>
                      ))}
                      {group.jobIds.length > 40 && (
                        <span className="px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          +{(group.jobIds.length - 40).toLocaleString()} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
