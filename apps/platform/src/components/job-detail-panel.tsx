import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpCircleIcon,
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AddJobPrefill } from "@/components/add-job-dialog";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { withToast } from "@/lib/notify";
import { useConfirm } from "@/components/confirm-provider";
import { useEffect, useRef, useState } from "react";
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
import { BookmarkFolderPicker } from "@/components/bookmark-folder-picker";
import { rpcClient } from "@/lib/api";
import type { JobDetail, JobSummary, ParsedLog } from "@unqueue/bullmq";
import { cn } from "@/lib/utils";
import {
  onResync,
  onSocketEvent,
  subscribeRooms,
  unsubscribeRooms,
} from "@/lib/socket";
import { Badge } from "@unqueue/ui/components/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { JobStatusChip } from "@/components/job-status-chip";
import { CodeBlock } from "@/components/code-block";
import {
  CodeBlockSkeleton,
  DetailValueSkeleton,
} from "@/components/job-detail-panel-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDelay,
  formatDuration,
  formatJobTimestamp,
} from "@/lib/format-timestamp";
import { formatJobAttemptsValue } from "@/lib/format-job-attempts";

function CopyButton({ value, label = "Copy job ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={copied ? "Copied" : label}
      title={label}
    >
      {copied ? (
        <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </button>
  );
}

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
        className={cn(
          "min-w-0 text-[11px] leading-tight",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function isJobDetail(job: JobDetail | JobSummary | undefined): job is JobDetail {
  return !!job && "payload" in job && "progress" in job && "logs" in job;
}

function mergeJobUpdate(
  current: JobDetail | JobSummary | null | undefined,
  incoming: JobSummary,
): JobDetail | JobSummary {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    name: incoming.name || current.name,
    timestamp: incoming.timestamp || current.timestamp,
    processedOn: incoming.processedOn ?? current.processedOn,
    finishedOn: incoming.finishedOn ?? current.finishedOn,
    failedReason: incoming.failedReason ?? current.failedReason,
    delay: incoming.delay ?? current.delay,
    priority: incoming.priority ?? current.priority,
    stacktrace: incoming.stacktrace ?? current.stacktrace,
    returnValue: incoming.returnValue ?? current.returnValue,
    opts: incoming.opts ?? current.opts,
  };
}

function mergeProgressUpdate(
  current: JobDetail | JobSummary | null | undefined,
  progress: unknown,
): JobDetail | JobSummary | null | undefined {
  if (!current) return current;
  return { ...current, progress };
}

export function JobDetailPanel({
  workspaceId,
  environmentId,
  redisInstanceId,
  queueName,
  jobId,
  listJob,
  canWrite = true,
  onRemoved,
  onEditReplay,
}: {
  workspaceId: string;
  environmentId: string;
  redisInstanceId: string;
  queueName: string;
  jobId: string;
  listJob?: JobDetail | JobSummary;
  canWrite?: boolean;
  onRemoved?: () => void;
  onEditReplay?: (prefill: AddJobPrefill) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [bookmarkPickerOpen, setBookmarkPickerOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const jobInvalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jobRoom = `job:${redisInstanceId}:${queueName}:${jobId}`;

  useEffect(() => {
    const queryKey = ["job", redisInstanceId, queueName, jobId] as const;

    subscribeRooms([jobRoom]);

    const offEvent = onSocketEvent((data) => {
      if (data.room !== jobRoom) return;

      if (data.type === "job:update") {
        const payload = data.payload as { job?: JobSummary };
        if (payload.job) {
          queryClient.setQueryData<JobDetail | JobSummary | null | undefined>(
            queryKey,
            (old) => mergeJobUpdate(old, payload.job!),
          );
        }
      }

      if (data.type === "job:progress") {
        const payload = data.payload as { progress?: unknown };
        queryClient.setQueryData<JobDetail | JobSummary | null | undefined>(
          queryKey,
          (old) => mergeProgressUpdate(old, payload.progress),
        );
      }

      if (data.type === "job:update" || data.type === "job:progress") {
        if (jobInvalidateTimer.current) clearTimeout(jobInvalidateTimer.current);
        jobInvalidateTimer.current = setTimeout(() => {
          void queryClient.invalidateQueries({
            queryKey,
          });
        }, 500);
      }
    });

    const offResync = onResync((data) => {
      if (data.room !== jobRoom) return;
      void queryClient.invalidateQueries({ queryKey });
    });

    return () => {
      offEvent();
      offResync();
      unsubscribeRooms([jobRoom]);
      if (jobInvalidateTimer.current) clearTimeout(jobInvalidateTimer.current);
    };
  }, [jobRoom, jobId, queueName, queryClient, redisInstanceId]);

  const listJobDetail = isJobDetail(listJob) ? listJob : undefined;

  const jobQuery = useQuery({
    queryKey: ["job", redisInstanceId, queueName, jobId],
    queryFn: () => rpcClient.job.get({ redisInstanceId, queueName, jobId }),
    initialData: listJobDetail,
    staleTime: listJobDetail ? Number.POSITIVE_INFINITY : 0,
  });

  const invalidateJob = () => {
    queryClient.invalidateQueries({ queryKey: ["job", redisInstanceId, queueName, jobId] });
    queryClient.invalidateQueries({
      queryKey: ["jobs", redisInstanceId, queueName],
    });
  };

  const runAction = async (
    action: () => Promise<unknown>,
    messages: { success: string; error: string },
  ) => {
    const result = await withToast(action, messages);
    invalidateJob();
    return result;
  };

  const job = jobQuery.data;
  const showSummarySkeleton = jobQuery.isLoading;
  const isLoadingHeavyFields = !job && jobQuery.isLoading;
  const created = formatJobTimestamp(job?.timestamp);
  const started = formatJobTimestamp(job?.processedOn);
  const finished = formatJobTimestamp(job?.finishedOn);
  const maxAttempts = job?.opts?.attempts;
  const logs = job?.logs ?? [];
  const actionsDisabled = showSummarySkeleton || !job || !canWrite;
  const hasPayload = !!job && "payload" in job;

  const jobLabel = (
    <>
      job <span className="font-mono">#{jobId}</span>
      {job?.name ? (
        <>
          {" "}(<span className="font-mono">{job.name}</span>)
        </>
      ) : null}
    </>
  );

  const retry = async () => {
    const ok = await confirm({
      title: "Retry this job?",
      description: (
        <>
          Moves {jobLabel} back to waiting so a worker runs it again, including any side
          effects in your job handler.
        </>
      ),
      confirmLabel: "Retry job",
    });
    if (!ok) return;
    await runAction(
      () => rpcClient.jobActions.retry({ redisInstanceId, queueName, jobId }),
      { success: `Job #${jobId} queued for retry`, error: "Could not retry job" },
    );
  };

  const promote = async () => {
    const ok = await confirm({
      title: "Run this delayed job now?",
      description: (
        <>Skips the remaining delay on {jobLabel} and moves it to waiting immediately.</>
      ),
      confirmLabel: "Run now",
    });
    if (!ok) return;
    await runAction(
      () => rpcClient.jobActions.promote({ redisInstanceId, queueName, jobId }),
      { success: `Job #${jobId} promoted`, error: "Could not promote job" },
    );
  };

  const replayAsIs = async () => {
    const ok = await confirm({
      title: "Replay this job?",
      description: (
        <>
          Enqueues a new job on <span className="font-mono">{queueName}</span> with the
          same name and payload as {jobLabel}. The original is left as it is.
        </>
      ),
      confirmLabel: "Replay job",
    });
    if (!ok) return;
    await runAction(
      () => rpcClient.jobActions.replay({ redisInstanceId, queueName, jobId }),
      { success: "Job replayed as a new job", error: "Could not replay job" },
    );
  };

  const editReplay = () => {
    if (!job || !hasPayload) return;
    onEditReplay?.({
      name: job.name,
      data: (job as JobDetail).payload,
      attempts: job.opts?.attempts,
      priority: job.opts?.priority,
      sourceJobId: job.id,
    });
  };

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("jobId", jobId);
    void navigator.clipboard
      .writeText(url.toString())
      .then(() => toast.success("Job link copied"));
  };

  const canRetry = job?.state === "failed" || job?.state === "completed";
  const canPromote = job?.state === "delayed";

  // The job sheet is itself a dialog, so allow overlays — but only act when
  // the sheet is the sole open overlay (not under a confirm/edit dialog).
  const sheetOnTop = () =>
    document.querySelectorAll(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
    ).length <= 1;

  useHotkeys(
    {
      r: () => {
        if (sheetOnTop() && !actionsDisabled && canRetry) void retry();
      },
      e: () => {
        if (sheetOnTop() && !actionsDisabled && onEditReplay) editReplay();
      },
      c: () => {
        if (sheetOnTop()) copyLink();
      },
    },
    { allowInOverlay: true },
  );

  return (
    <>
      <SheetHeader className="shrink-0 gap-2 border-b px-4 py-4 pr-12">
        <div className="flex items-start justify-between gap-3">
          <SheetTitle className="min-w-0 flex-1 truncate">
            Job <span className="font-mono">{jobId}</span>
          </SheetTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {canRetry && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionsDisabled}
                onClick={() => void retry()}
                title="Retry (r)"
              >
                <RotateCcwIcon />
                Retry
              </Button>
            )}
            {canPromote && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionsDisabled}
                onClick={() => void promote()}
                title="Run this delayed job now"
              >
                <ArrowUpCircleIcon />
                Run now
              </Button>
            )}
            {onEditReplay && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionsDisabled || !hasPayload}
                onClick={editReplay}
                title="Edit payload and enqueue a copy (e)"
              >
                <PencilLineIcon />
                Edit &amp; replay
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="size-8" aria-label="More job actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={copyLink}>
                  <LinkIcon />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={actionsDisabled}
                  onClick={() => setBookmarkPickerOpen(true)}
                >
                  <BookmarkIcon />
                  Bookmark
                </DropdownMenuItem>
                <DropdownMenuItem disabled={actionsDisabled} onClick={() => void replayAsIs()}>
                  <CopyIcon />
                  Replay as-is
                </DropdownMenuItem>
                {!canRetry && (
                  <DropdownMenuItem disabled={actionsDisabled} onClick={() => void retry()}>
                    <RotateCcwIcon />
                    Retry
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={actionsDisabled}
                  onClick={() => setRemoveConfirmOpen(true)}
                >
                  <Trash2Icon />
                  Remove job
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Job <span className="font-mono">{jobId}</span> will be permanently removed from the queue. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      void runAction(
                        () => rpcClient.jobActions.remove({ redisInstanceId, queueName, jobId }),
                        { success: `Removed job #${jobId}`, error: "Could not remove job" },
                      ).then((result) => {
                        if (result) onRemoved?.();
                      })
                    }
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {showSummarySkeleton ? (
          <Skeleton className="h-3.5 w-48" />
        ) : (
          job && (
            <SheetDescription className="truncate">{job.name}</SheetDescription>
          )
        )}
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-5 text-xs">
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Details
            </h3>
            {showSummarySkeleton ? (
              <div className="grid grid-cols-2 gap-x-6">
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Job ID" mono>
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <span className="truncate">{jobId}</span>
                      <CopyButton value={jobId} />
                    </span>
                  </DetailRow>
                  <DetailRow label="Name">
                    <DetailValueSkeleton className="w-28" />
                  </DetailRow>
                  <DetailRow label="Queue" mono>
                    {queueName}
                  </DetailRow>
                  <DetailRow label="Created" mono>
                    <DetailValueSkeleton className="w-32" />
                  </DetailRow>
                  <DetailRow label="Started" mono>
                    <DetailValueSkeleton className="w-32" />
                  </DetailRow>
                  <DetailRow label="Finished" mono>
                    <DetailValueSkeleton className="w-32" />
                  </DetailRow>
                  <DetailRow label="Duration" mono>
                    <DetailValueSkeleton className="w-16" />
                  </DetailRow>
                </dl>
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Status">
                    <DetailValueSkeleton className="h-5 w-16 rounded-full" />
                  </DetailRow>
                  <DetailRow label="Attempts" mono>
                    <DetailValueSkeleton className="w-10" />
                  </DetailRow>
                  <DetailRow label="Priority" mono>
                    <DetailValueSkeleton className="w-8" />
                  </DetailRow>
                  <DetailRow label="Delay" mono>
                    <DetailValueSkeleton className="w-12" />
                  </DetailRow>
                </dl>
              </div>
            ) : !job ? (
              <p className="text-muted-foreground">Job not found</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Job ID" mono>
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <span className="truncate">{job.id}</span>
                      <CopyButton value={job.id} />
                    </span>
                  </DetailRow>
                  <DetailRow label="Name">{job.name}</DetailRow>
                  <DetailRow label="Queue" mono>
                    {queueName}
                  </DetailRow>
                  <DetailRow label="Created" mono>
                    <span title={created.title}>{created.label}</span>
                  </DetailRow>
                  <DetailRow label="Started" mono>
                    <span title={started.title}>{started.label}</span>
                  </DetailRow>
                  <DetailRow label="Finished" mono>
                    <span title={finished.title}>{finished.label}</span>
                  </DetailRow>
                  <DetailRow label="Duration" mono>
                    {formatDuration(job.processedOn, job.finishedOn)}
                  </DetailRow>
                </dl>
                <dl className="min-w-0 space-y-0.5">
                  <DetailRow label="Status">
                    <JobStatusChip state={job.state} />
                  </DetailRow>
                  <DetailRow label="Attempts" mono>
                    {formatJobAttemptsValue(job.attemptsMade, maxAttempts)}
                  </DetailRow>
                  <DetailRow label="Priority" mono>
                    {job.priority ?? job.opts?.priority ?? "—"}
                  </DetailRow>
                  <DetailRow label="Delay" mono>
                    {formatDelay(job.delay ?? job.opts?.delay)}
                  </DetailRow>
                </dl>
              </div>
            )}
          </section>

          {job?.failedReason && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 font-medium text-destructive">Failed reason</h3>
                <CodeBlock code={job.failedReason} variant="destructive" />
              </section>
            </>
          )}

          {job?.stacktrace && job.stacktrace.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 font-medium text-muted-foreground">Stack trace</h3>
                <CodeBlock
                  code={job.stacktrace.join("\n")}
                  lang="javascript"
                  maxHeight="12rem"
                />
              </section>
            </>
          )}

          {job?.returnValue != null && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 font-medium text-muted-foreground">Return value</h3>
                <CodeBlock value={job.returnValue} />
              </section>
            </>
          )}

          {job?.opts && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 font-medium text-muted-foreground">Options</h3>
                <CodeBlock
                  value={{
                    attempts: job.opts.attempts,
                    backoff: job.opts.backoff,
                    priority: job.opts.priority,
                    delay: job.opts.delay,
                    removeOnComplete: job.opts.removeOnComplete,
                    removeOnFail: job.opts.removeOnFail,
                  }}
                />
              </section>
            </>
          )}

          <Separator />

          <section>
            <h3 className="mb-2 font-medium text-muted-foreground">Progress</h3>
            {isLoadingHeavyFields ? (
              <CodeBlockSkeleton lines={3} />
            ) : job?.progress &&
              typeof job.progress === "object" &&
              job.progress !== null &&
              Object.keys(job.progress).length > 0 ? (
              <div className="space-y-2">
                {"currentStep" in job.progress && (
                  <DetailRow label="Step">
                    {String((job.progress as { currentStep?: string }).currentStep)}
                  </DetailRow>
                )}
                {"percent" in job.progress && (
                  <DetailRow label="Percent">
                    {(job.progress as { percent?: number }).percent}%
                  </DetailRow>
                )}
                {"steps" in job.progress &&
                  Array.isArray((job.progress as { steps?: unknown[] }).steps) &&
                  (
                    job.progress as {
                      steps: Array<{ name: string; status: string }>;
                    }
                  ).steps.map((step) => (
                    <div key={step.name} className="flex gap-2">
                      <Badge variant="outline">{step.status}</Badge>
                      <span>{step.name}</span>
                    </div>
                  ))}
                {!("currentStep" in job.progress) &&
                  !("percent" in job.progress) &&
                  !("steps" in job.progress) && (
                    <CodeBlock value={job.progress} />
                  )}
              </div>
            ) : (
              <p className="text-muted-foreground">No progress</p>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 flex items-center gap-1 font-medium text-muted-foreground">
              Payload
              {job && hasPayload && (job as JobDetail).payload != null && (
                <CopyButton
                  value={JSON.stringify((job as JobDetail).payload, null, 2)}
                  label="Copy payload"
                />
              )}
            </h3>
            {isLoadingHeavyFields ? (
              <CodeBlockSkeleton lines={6} />
            ) : job?.payload == null ? (
              <p className="text-muted-foreground">No payload</p>
            ) : (
              <CodeBlock value={job.payload} />
            )}
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 font-medium text-muted-foreground">
              Logs {logs.length > 0 && `(${logs.length})`}
            </h3>
            {isLoadingHeavyFields ? (
              <CodeBlockSkeleton lines={5} />
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground">No logs</p>
            ) : (
              <JobLogs logs={logs} />
            )}
          </section>
        </div>
      </div>

      <BookmarkFolderPicker
        open={bookmarkPickerOpen}
        onOpenChange={setBookmarkPickerOpen}
        workspaceId={workspaceId}
        redisInstanceId={redisInstanceId}
        queueName={queueName}
        jobId={jobId}
        environmentId={environmentId}
        canWrite={canWrite}
      />
    </>
  );
}

const LOG_LEVEL_CLASS: Record<string, string> = {
  error: "text-destructive",
  fatal: "text-destructive",
  warn: "text-amber-600 dark:text-amber-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
  debug: "text-muted-foreground",
  trace: "text-muted-foreground",
};

function formatLogTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function JobLogs({ logs }: { logs: ParsedLog[] }) {
  const [level, setLevel] = useState<string>("all");
  const levels = [
    ...new Set(
      logs
        .map((log) => (log.format === "json" ? log.entry?.level?.toLowerCase() : undefined))
        .filter((l): l is string => !!l),
    ),
  ];
  const visible =
    level === "all"
      ? logs
      : logs.filter((log) => log.entry?.level?.toLowerCase() === level);

  return (
    <div className="space-y-2">
      {levels.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {["all", ...levels].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                level === l
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 py-1.5 font-mono text-[11px] leading-relaxed">
        {visible.map((log, i) =>
          log.format === "json" && log.entry ? (
            <div key={i} className="flex gap-2 px-3 hover:bg-muted/60">
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatLogTime(log.entry.ts)}
              </span>
              <span
                className={cn(
                  "w-10 shrink-0 uppercase",
                  LOG_LEVEL_CLASS[log.entry.level.toLowerCase()] ?? "text-muted-foreground",
                )}
              >
                {log.entry.level}
              </span>
              <span className="min-w-0 break-words whitespace-pre-wrap">
                {log.entry.message}
                {log.entry.metadata && Object.keys(log.entry.metadata).length > 0 && (
                  <span className="text-muted-foreground"> {JSON.stringify(log.entry.metadata)}</span>
                )}
              </span>
            </div>
          ) : (
            <div key={i} className="px-3 break-words whitespace-pre-wrap hover:bg-muted/60">
              {log.raw}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
