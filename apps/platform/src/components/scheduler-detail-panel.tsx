import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PlayCircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { rpcClient } from "@/lib/api";
import { useConfirm } from "@/components/confirm-provider";
import { withToast } from "@/lib/notify";
import type { SchedulerSummary } from "@unqueue/bullmq";
import { Badge } from "@unqueue/ui/components/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeBlock } from "@/components/code-block";
import {
  formatJobTimestamp,
  formatElapsedMs,
} from "@/lib/format-timestamp";
import { SchedulerEditDialog } from "@/components/scheduler-edit-dialog";

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 py-px">
      <dt className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`min-w-0 text-[11px] leading-tight ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

function formatSchedule(scheduler: SchedulerSummary): string {
  if (scheduler.pattern) {
    return `cron: ${scheduler.pattern}`;
  }
  if (scheduler.every) {
    return `every ${formatElapsedMs(scheduler.every)}`;
  }
  return "—";
}

export function SchedulerDetailPanel({
  redisInstanceId,
  queueName,
  schedulerId,
  canWrite = true,
  onRemoved,
}: {
  redisInstanceId: string;
  queueName: string;
  schedulerId: string;
  canWrite?: boolean;
  onRemoved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const schedulerQuery = useQuery({
    queryKey: ["scheduler", redisInstanceId, queueName, schedulerId],
    queryFn: () =>
      rpcClient.scheduler.get({ redisInstanceId, queueName, schedulerId }),
  });

  const invalidateScheduler = () => {
    queryClient.invalidateQueries({
      queryKey: ["scheduler", redisInstanceId, queueName, schedulerId],
    });
    queryClient.invalidateQueries({
      queryKey: ["schedulers", redisInstanceId, queueName],
    });
  };

  const confirm = useConfirm();

  const runAction = async (
    action: () => Promise<unknown>,
    messages: { success: string; error: string } = {
      success: "Scheduler updated",
      error: "Scheduler action failed",
    },
  ) => {
    const ok = await withToast(async () => {
      await action();
      return true as const;
    }, messages);
    invalidateScheduler();
    return ok === true;
  };

  const runNow = async () => {
    const ok = await confirm({
      title: "Run scheduler now?",
      description: (
        <>
          Enqueues a job from <span className="font-mono">{schedulerId}</span> right away,
          in addition to its regular schedule.
        </>
      ),
      confirmLabel: "Run now",
    });
    if (!ok) return;
    await runAction(
      () => rpcClient.scheduler.run({ redisInstanceId, queueName, schedulerId }),
      { success: "Scheduler triggered", error: "Could not run scheduler" },
    );
  };

  const saveEdit = async (updates: { pattern?: string; every?: number }) => {
    const describe = (pattern?: string | null, every?: number | null) =>
      pattern ? `cron "${pattern}"` : every ? `every ${every.toLocaleString()}ms` : "—";
    const ok = await confirm({
      title: "Change this schedule?",
      description: (
        <>
          <span className="font-mono">{schedulerId}</span> will switch from{" "}
          <span className="font-mono">{describe(scheduler?.pattern, scheduler?.every)}</span> to{" "}
          <span className="font-mono">{describe(updates.pattern, updates.every)}</span>. The
          next run is recalculated immediately.
        </>
      ),
      confirmLabel: "Update schedule",
    });
    if (!ok) return;
    const result = await runAction(
      () =>
        rpcClient.scheduler.update({
          redisInstanceId,
          queueName,
          schedulerId,
          ...updates,
        }),
      { success: "Schedule updated", error: "Could not update schedule" },
    );
    if (result) setEditOpen(false);
  };

  const scheduler = schedulerQuery.data;
  const isLoading = schedulerQuery.isLoading;
  const nextRun = formatJobTimestamp(scheduler?.nextMillis);
  const lastRun = formatJobTimestamp(scheduler?.prevMillis);

  return (
    <>
      <SheetHeader className="shrink-0 gap-2 border-b px-4 py-4 pr-12">
        <div className="flex items-start justify-between gap-3">
          <SheetTitle className="min-w-0 flex-1 truncate">
            Scheduler
          </SheetTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading || !scheduler || !canWrite}
              onClick={() => void runNow()}
            >
              <PlayCircleIcon />
              Run Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading || !scheduler || !canWrite}
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon />
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isLoading || !scheduler || !canWrite}
              onClick={() => setRemoveConfirmOpen(true)}
            >
              <Trash2Icon />
              Remove
            </Button>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-3.5 w-48" />
        ) : (
          scheduler && (
            <SheetDescription className="truncate font-mono">
              {scheduler.id}
            </SheetDescription>
          )
        )}
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-5 text-xs">
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Details
            </h3>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-x-6">
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Scheduler ID">
                    <Skeleton className="h-3.5 w-40" />
                  </DetailRow>
                  <DetailRow label="Job Name">
                    <Skeleton className="h-3.5 w-28" />
                  </DetailRow>
                  <DetailRow label="Schedule">
                    <Skeleton className="h-3.5 w-32" />
                  </DetailRow>
                </dl>
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Next Run">
                    <Skeleton className="h-3.5 w-24" />
                  </DetailRow>
                  <DetailRow label="Last Run">
                    <Skeleton className="h-3.5 w-24" />
                  </DetailRow>
                  <DetailRow label="Runs">
                    <Skeleton className="h-3.5 w-12" />
                  </DetailRow>
                </dl>
              </div>
            ) : !scheduler ? (
              <p className="text-muted-foreground">Scheduler not found</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Scheduler ID" mono>
                    {scheduler.id}
                  </DetailRow>
                  <DetailRow label="Job Name">{scheduler.name}</DetailRow>
                  <DetailRow label="Schedule" mono>
                    <Badge variant="outline">{formatSchedule(scheduler)}</Badge>
                  </DetailRow>
                  {scheduler.tz && (
                    <DetailRow label="Timezone" mono>
                      {scheduler.tz}
                    </DetailRow>
                  )}
                  {scheduler.startDate && (
                    <DetailRow label="Start Date" mono>
                      <span title={formatJobTimestamp(scheduler.startDate).title}>
                        {formatJobTimestamp(scheduler.startDate).label}
                      </span>
                    </DetailRow>
                  )}
                  {scheduler.endDate && (
                    <DetailRow label="End Date" mono>
                      <span title={formatJobTimestamp(scheduler.endDate).title}>
                        {formatJobTimestamp(scheduler.endDate).label}
                      </span>
                    </DetailRow>
                  )}
                  {scheduler.limit != null && (
                    <DetailRow label="Limit" mono>
                      {scheduler.limit}
                    </DetailRow>
                  )}
                </dl>
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Next Run" mono>
                    <span title={nextRun.title}>{nextRun.label}</span>
                  </DetailRow>
                  <DetailRow label="Last Run" mono>
                    <span title={lastRun.title}>{lastRun.label}</span>
                  </DetailRow>
                  <DetailRow label="Runs" mono>
                    {scheduler.count ?? 0}
                  </DetailRow>
                </dl>
              </div>
            )}
          </section>

          {scheduler?.opts && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 font-medium text-muted-foreground">
                  Options
                </h3>
                <CodeBlock
                  value={{
                    attempts: scheduler.opts.attempts,
                    backoff: scheduler.opts.backoff,
                    priority: scheduler.opts.priority,
                    removeOnComplete: scheduler.opts.removeOnComplete,
                    removeOnFail: scheduler.opts.removeOnFail,
                  }}
                />
              </section>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove scheduler?</AlertDialogTitle>
            <AlertDialogDescription>
              Scheduler{" "}
              <span className="font-mono">{schedulerId}</span> will be
              permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                void runAction(
                  () =>
                    rpcClient.scheduler.remove({
                      redisInstanceId,
                      queueName,
                      schedulerId,
                    }),
                  { success: "Scheduler removed", error: "Could not remove scheduler" },
                ).then((removed) => {
                  if (removed) onRemoved?.();
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SchedulerEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        schedulerId={schedulerId}
        initialPattern={scheduler?.pattern}
        initialEvery={scheduler?.every}
        onSave={(updates) => void saveEdit(updates)}
      />
    </>
  );
}
