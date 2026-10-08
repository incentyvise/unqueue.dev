import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CopyIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { FailedJobGroup } from "@unqueue/bullmq";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/kbd";
import { AddJobDialog, type AddJobPrefill } from "@/components/add-job-dialog";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { bulkResultMessage, withToast } from "@/lib/notify";
import { QueueHistoryPanel } from "@/components/queue-history-panel";
import { z } from "zod";
import { rpcClient } from "@/lib/api";
import { useStatusBar } from "@/components/shell-context";
import {
  environmentQueuesQueryOptions,
  environmentRedisQueryOptions,
} from "@/lib/environment-queues-query";
import { QueueActionDialog, type QueueAction } from "@/components/queue-action-dialog";
import {
  applyLatestJobRemoved,
  applyLatestJobUpdate,
  applyQueueCountsPatch,
  type LatestJobSummary,
} from "@/lib/queue-cache-updates";
import { useShellContext } from "@/hooks/use-shell-context";
import {
  onResync,
  onSocketEvent,
  subscribeRooms,
  unsubscribeRooms,
} from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { JobDetailPanel } from "@/components/job-detail-panel";
import { FailedJobGroupsTable } from "@/components/failed-job-groups-table";
import { SchedulerList } from "@/components/scheduler-list";
import { SchedulerDetailPanel } from "@/components/scheduler-detail-panel";
import {
  QueueJobsTable,
  QueueJobsTableSkeleton,
  QUEUE_TABLE_SKELETON_ROWS,
} from "@/components/queue-jobs-table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { RoutePending } from "@/lib/route-pending";
import {
  getQueueTabJobCount,
  getQueueTabEmptyState,
  type QueueJobFilterState,
  QueueMetricsPanel,
  QueuePageHeader,
  QueueStateTabs,
} from "@/components/queue-page-toolbar";

const PAGE_SIZE = 100;
const LOAD_MORE_MIN_THRESHOLD_PX = 600;

const jobFilterStates = [
  "latest",
  "completed",
  "failed",
  "errors",
  "active",
  "prioritized",
  "waiting",
  "waiting-children",
  "delayed",
  "paused",
  "schedulers",
] as const;

const searchSchema = z.object({
  redisInstanceId: z.string(),
  state: z
    .union([z.enum(jobFilterStates), z.literal("all")])
    .transform((value) => (value === "all" ? "latest" : value))
    .default("latest"),
  jobId: z.string().optional(),
  q: z.string().optional(),
});

function hasJobDetailFields(job: unknown): boolean {
  return (
    typeof job === "object" &&
    job !== null &&
    "payload" in job &&
    "progress" in job &&
    Array.isArray((job as { logs?: unknown }).logs)
  );
}

export const Route = createFileRoute(
  "/$workspaceId/$environmentId/queues/$queueName",
)({
  validateSearch: searchSchema,
  pendingComponent: RoutePending,
  component: QueuePage,
});

function QueuePage() {
  const { workspaceId, environmentId, queueName } = Route.useParams();
  const {
    redisInstanceId,
    state,
    jobId: jobIdFromSearch,
    q: searchFromUrl,
  } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFetchingNextPageRef = useRef(false);
  const hasNextPageRef = useRef(false);
  const metricsInvalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobsInvalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [metricsWindow, setMetricsWindow] = useState<
    "1m" | "1h" | "24h" | "7d"
  >("1h");
  const [sheetJobId, setSheetJobId] = useState<string | undefined>(
    jobIdFromSearch,
  );
  const [sheetSchedulerId, setSheetSchedulerId] = useState<string | undefined>();
  const [searchInput, setSearchInput] = useState(searchFromUrl ?? "");
  const deferredSearch = useDeferredValue(searchInput.trim());
  const [debouncedSearch, setDebouncedSearch] = useState(deferredSearch);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [addJobPrefill, setAddJobPrefill] = useState<AddJobPrefill | undefined>();
  const [bulkBusy, setBulkBusy] = useState<"retry" | "replay" | "remove" | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(deferredSearch), 400);
    return () => clearTimeout(timer);
  }, [deferredSearch]);

  // Keep the input in sync when the URL changes underneath us (queue switch,
  // back/forward). Our own debounced writes round-trip to the same value.
  useEffect(() => {
    const fromUrl = searchFromUrl ?? "";
    if (fromUrl !== debouncedSearch) {
      setSearchInput(fromUrl);
      setDebouncedSearch(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFromUrl, queueName, redisInstanceId]);

  useEffect(() => {
    if ((searchFromUrl ?? "") === debouncedSearch) return;
    void navigate({
      to: "/$workspaceId/$environmentId/queues/$queueName",
      params: { workspaceId, environmentId, queueName },
      search: {
        redisInstanceId,
        state,
        jobId: jobIdFromSearch,
        q: debouncedSearch || undefined,
      },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setSheetJobId(jobIdFromSearch);
  }, [jobIdFromSearch]);

  useEffect(() => {
    setSelected(new Set());
    setSelectingAll(false);
    setFocusIndex(-1);
  }, [state, debouncedSearch]);

  const { workspaceRole } = useShellContext();
  const canWrite = workspaceRole !== undefined && workspaceRole !== "viewer";
  const { setSlotContent } = useStatusBar();
  const [pendingAction, setPendingAction] = useState<QueueAction | null>(null);

  const { data: redisInstances } = useQuery(environmentRedisQueryOptions(environmentId));
  const redisNickname = redisInstances?.find((r) => r.id === redisInstanceId)?.nickname;

  const { data: cachedQueues } = useQuery(environmentQueuesQueryOptions(environmentId));
  const cachedQueue = cachedQueues?.find(
    (q) => q.name === queueName && q.redisInstanceId === redisInstanceId,
  );

  const queueMetaQuery = useQuery({
    queryKey: ["queue-meta", redisInstanceId, queueName],
    queryFn: () =>
      rpcClient.queue.getMeta({
        redisInstanceId,
        queueName,
        forceRefresh: true,
      }),
  });

  const metricsQuery = useQuery({
    queryKey: ["queue-metrics", redisInstanceId, queueName, metricsWindow],
    queryFn: () =>
      rpcClient.queue.getMetrics({
        redisInstanceId,
        queueName,
        window: metricsWindow,
      }),
    enabled: true,
  });

  const stateCount = getQueueTabJobCount(queueMetaQuery.data?.counts, state);
  const isPaused = queueMetaQuery.data?.isPaused ?? false;

  const jobsQuery = useInfiniteQuery({
    queryKey: ["jobs", redisInstanceId, queueName, state],
    queryFn: ({ pageParam }) => {
      const apiState = state === "latest" ? "all" : (state as "waiting" | "active" | "completed" | "failed" | "prioritized" | "waiting-children" | "delayed" | "paused");
      return rpcClient.job.list({
        redisInstanceId,
        queueName,
        state: apiState,
        start: pageParam * PAGE_SIZE,
        end: pageParam * PAGE_SIZE + PAGE_SIZE - 1,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPageParam + 1,
    enabled: state !== "schedulers" && state !== "errors",
  });

  const errorsQuery = useQuery({
    queryKey: ["failed-groups", redisInstanceId, queueName],
    queryFn: () =>
      rpcClient.job.listFailedGroups({ redisInstanceId, queueName }),
    enabled: state === "errors",
  });

  const schedulersQuery = useQuery({
    queryKey: ["schedulers", redisInstanceId, queueName],
    queryFn: () =>
      rpcClient.scheduler.list({ redisInstanceId, queueName }),
    enabled: state === "schedulers",
  });

  const isSearching =
    debouncedSearch.length > 0 && state !== "schedulers" && state !== "errors";

  const searchQuery = useQuery({
    queryKey: ["job-search", redisInstanceId, queueName, state, debouncedSearch],
    queryFn: () =>
      rpcClient.job.search({
        redisInstanceId,
        queueName,
        state: state === "latest" ? "all" : (state as "waiting" | "active" | "completed" | "failed" | "prioritized" | "waiting-children" | "delayed" | "paused"),
        query: debouncedSearch,
        limit: 200,
      }),
    enabled: isSearching,
    placeholderData: (prev) => prev,
  });

  const listedJobs = useMemo(
    () => jobsQuery.data?.pages.flat() ?? [],
    [jobsQuery.data],
  );
  const jobs = isSearching ? (searchQuery.data?.jobs ?? []) : listedJobs;
  const knownJobNames = useMemo(
    () => [...new Set(listedJobs.map((job) => job.name))].sort(),
    [listedJobs],
  );
  const fetchedCount = jobs.length;
  const sheetListJob = sheetJobId
    ? jobs.find((job) => job.id === sheetJobId)
    : undefined;

  const openEditReplay = (prefill: AddJobPrefill) => {
    setAddJobPrefill(prefill);
    setAddJobOpen(true);
  };

  const openAddJob = () => {
    setAddJobPrefill(undefined);
    setAddJobOpen(true);
  };

  useEffect(() => {
    const room = `queue:${redisInstanceId}:${queueName}`;

    const offEvent = onSocketEvent((data) => {
      if (data.room !== room) return;
      if (data.type === "job:update") {
        const payload = data.payload as { job?: LatestJobSummary };
        if (payload.job) {
          applyLatestJobUpdate(
            queryClient,
            redisInstanceId,
            queueName,
            payload.job,
          );
        }
        if (state !== "latest") {
          if (jobsInvalidateTimer.current) clearTimeout(jobsInvalidateTimer.current);
          jobsInvalidateTimer.current = setTimeout(() => {
            void queryClient.invalidateQueries({
              queryKey: ["jobs", redisInstanceId, queueName, state],
            });
          }, 1000);
        }
      }
      if (data.type === "job:removed") {
        const payload = data.payload as { jobId?: string };
        if (payload.jobId) {
          applyLatestJobRemoved(
            queryClient,
            redisInstanceId,
            queueName,
            payload.jobId,
          );
        }
        if (state !== "latest") {
          if (jobsInvalidateTimer.current) clearTimeout(jobsInvalidateTimer.current);
          jobsInvalidateTimer.current = setTimeout(() => {
            void queryClient.invalidateQueries({
              queryKey: ["jobs", redisInstanceId, queueName, state],
            });
          }, 1000);
        }
      }
      if (data.type === "queue:counts") {
        applyQueueCountsPatch(
          queryClient,
          environmentId,
          data.room,
          data.payload,
        );
        const payload = data.payload as {
          counts?: NonNullable<typeof queueMetaQuery.data>["counts"];
          isPaused?: boolean;
        };
        if (payload.counts) {
          queryClient.setQueryData(
            ["queue-meta", redisInstanceId, queueName],
            (old: typeof queueMetaQuery.data) =>
              old
                ? {
                    ...old,
                    counts: payload.counts!,
                    isPaused: payload.isPaused ?? old.isPaused,
                  }
                : old,
          );
        }
      }
      if (data.type === "metrics:update") {
        if (metricsInvalidateTimer.current) clearTimeout(metricsInvalidateTimer.current);
        metricsInvalidateTimer.current = setTimeout(() => {
          void queryClient.invalidateQueries({
            queryKey: ["queue-metrics", redisInstanceId, queueName],
          });
        }, 2000);
      }
    });

    const offResync = onResync((data) => {
      if (data.room === room) {
        void queryClient.invalidateQueries({
          queryKey: ["jobs", redisInstanceId, queueName, state],
        });
        void queryClient.invalidateQueries({
          queryKey: ["queue-meta", redisInstanceId, queueName],
        });
      }
    });

    subscribeRooms([room]);

    return () => {
      offEvent();
      offResync();
      unsubscribeRooms([room]);
      if (metricsInvalidateTimer.current) clearTimeout(metricsInvalidateTimer.current);
      if (jobsInvalidateTimer.current) clearTimeout(jobsInvalidateTimer.current);
    };
  }, [environmentId, redisInstanceId, queueName, queryClient, state]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allSelected =
        jobs.length > 0 && jobs.every((job) => prev.has(job.id));
      if (allSelected) return new Set();
      return new Set(jobs.map((job) => job.id));
    });
  };

  const selectAll = async () => {
    setSelectingAll(true);
    try {
      const apiState = state === "latest" ? "all" : (state as "waiting" | "active" | "completed" | "failed" | "prioritized" | "waiting-children" | "delayed" | "paused");
      const ids = await rpcClient.job.listIds({
        redisInstanceId,
        queueName,
        state: apiState,
      });
      setSelected(new Set(ids));
    } finally {
      setSelectingAll(false);
    }
  };

  const afterBulk = () => {
    setSelected(new Set());
    void jobsQuery.refetch();
    if (isSearching) void searchQuery.refetch();
    void queryClient.invalidateQueries({
      queryKey: ["failed-groups", redisInstanceId, queueName],
    });
  };

  const runBulk = async (
    kind: "retry" | "replay" | "remove",
    jobIds: string[],
    group?: FailedJobGroup,
  ) => {
    if (jobIds.length === 0) return undefined;
    const n = jobIds.length.toLocaleString();
    const noun = jobIds.length === 1 ? "job" : "jobs";
    const scope = group ? (
      <>
        {" "}These are the failed <span className="font-mono">{group.name}</span> jobs
        with the error <span className="font-mono">{group.message}</span>.
      </>
    ) : null;
    const copy = {
      retry: {
        title: `Retry ${n} ${noun}?`,
        description: (
          <>
            {jobIds.length === 1 ? "It moves" : "They move"} back to waiting on{" "}
            <span className="font-mono">{queueName}</span> and workers run{" "}
            {jobIds.length === 1 ? "it" : "them"} again, including any side effects in
            your job handler.{scope}
          </>
        ),
        confirmLabel: `Retry ${n} ${noun}`,
        destructive: false,
      },
      replay: {
        title: `Replay ${n} ${noun}?`,
        description: (
          <>
            Enqueues {n} new {noun} on <span className="font-mono">{queueName}</span>{" "}
            with the same name and payload. The originals are left as they are.{scope}
          </>
        ),
        confirmLabel: `Replay ${n} ${noun}`,
        destructive: false,
      },
      remove: {
        title: `Remove ${n} ${noun}?`,
        description: (
          <>
            Permanently deletes {jobIds.length === 1 ? "this job" : "these jobs"} from{" "}
            <span className="font-mono">{queueName}</span>. Active jobs locked by a worker
            are skipped. This cannot be undone.{scope}
          </>
        ),
        confirmLabel: `Remove ${n} ${noun}`,
        destructive: true,
      },
    }[kind];
    if (!(await confirm(copy))) return undefined;

    const actions = {
      retry: () => rpcClient.jobActions.bulkRetry({ redisInstanceId, queueName, jobIds }),
      replay: () => rpcClient.jobActions.bulkReplay({ redisInstanceId, queueName, jobIds }),
      remove: () => rpcClient.jobActions.bulkRemove({ redisInstanceId, queueName, jobIds }),
    };
    const verbs = { retry: "Retried", replay: "Replayed", remove: "Removed" };
    const present = { retry: "Retrying", replay: "Replaying", remove: "Removing" };
    setBulkBusy(kind);
    const result = await withToast(actions[kind], {
      loading: `${present[kind]} ${jobIds.length.toLocaleString()} jobs…`,
      success: (r) => bulkResultMessage(verbs[kind], r),
      error: `Could not ${kind} jobs`,
    });
    setBulkBusy(null);
    if (result) afterBulk();
    return result;
  };

  const bulkRetry = () => runBulk("retry", [...selected]);
  const bulkReplay = () => runBulk("replay", [...selected]);
  const bulkRemove = () => runBulk("remove", [...selected]);

  const retryGroup = async (group: FailedJobGroup) => {
    await runBulk("retry", group.jobIds, group);
  };

  const removeGroup = (group: FailedJobGroup) => {
    void runBulk("remove", group.jobIds, group);
  };

  const refresh = () => {
    void queueMetaQuery.refetch();
    void metricsQuery.refetch();
    if (state === "errors") void errorsQuery.refetch();
    else if (state === "schedulers") void schedulersQuery.refetch();
    else if (isSearching) void searchQuery.refetch();
    else void jobsQuery.refetch();
  };

  const runScheduler = async (schedulerId: string) => {
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
    await withToast(
      () => rpcClient.scheduler.run({ redisInstanceId, queueName, schedulerId }),
      { success: "Scheduler triggered", error: "Could not run scheduler" },
    );
    void schedulersQuery.refetch();
  };

  const removeScheduler = async (schedulerId: string) => {
    const ok = await confirm({
      title: "Remove scheduler?",
      description: (
        <>
          <span className="font-mono">{schedulerId}</span> stops producing jobs. BullMQ
          can&apos;t pause schedulers, so recreating it means re-adding it from your code.
        </>
      ),
      confirmLabel: "Remove scheduler",
      destructive: true,
    });
    if (!ok) return;
    const removed = await withToast(
      async () => {
        await rpcClient.scheduler.remove({ redisInstanceId, queueName, schedulerId });
        return true as const;
      },
      { success: "Scheduler removed", error: "Could not remove scheduler" },
    );
    void schedulersQuery.refetch();
    if (removed) setSheetSchedulerId(undefined);
  };

  const executeAction = async (action: QueueAction) => {
    const q = { redisInstanceId, queueName };
    switch (action) {
      case "pause":
        await withToast(() => rpcClient.queueAdmin.pause(q), {
          success: `Paused ${queueName}`,
          error: "Could not pause queue",
        });
        break;
      case "resume":
        await withToast(() => rpcClient.queueAdmin.resume(q), {
          success: `Resumed ${queueName}`,
          error: "Could not resume queue",
        });
        break;
      case "drain":
        await withToast(() => rpcClient.queueAdmin.drain({ ...q, delayed: false }), {
          loading: "Draining waiting jobs…",
          success: "Waiting jobs drained",
          error: "Could not drain queue",
        });
        break;
      case "clean":
        await withToast(
          async () => {
            const [completed, failed] = await Promise.all([
              rpcClient.queueAdmin.clean({ ...q, type: "completed", grace: 0, limit: 10000 }),
              rpcClient.queueAdmin.clean({ ...q, type: "failed", grace: 0, limit: 10000 }),
            ]);
            return (Array.isArray(completed) ? completed.length : 0) +
              (Array.isArray(failed) ? failed.length : 0);
          },
          {
            loading: "Cleaning finished jobs…",
            success: (n) => `Removed ${n.toLocaleString()} finished ${n === 1 ? "job" : "jobs"}`,
            error: "Could not clean queue",
          },
        );
        break;
      case "obliterate":
        await withToast(() => rpcClient.queueAdmin.obliterate(q), {
          loading: "Obliterating queue…",
          success: `Obliterated ${queueName}`,
          error: "Could not obliterate queue",
        });
        break;
    }
    refresh();
  };

  const copyQueueLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("jobId");
    void navigator.clipboard
      .writeText(url.toString())
      .then(() => toast.success("Queue link copied"));
  };

  const isLoadingJobs =
    queueMetaQuery.isPending ||
    (state !== "schedulers" &&
      (isSearching ? searchQuery.isPending : jobsQuery.isPending));
  const isEmpty = !isLoadingJobs && fetchedCount === 0;
  const isFetching =
    queueMetaQuery.isFetching ||
    metricsQuery.isFetching ||
    jobsQuery.isFetching ||
    searchQuery.isFetching;

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = jobsQuery;

  isFetchingNextPageRef.current = isFetchingNextPage;
  hasNextPageRef.current = hasNextPage;

  const minJobsToLoad = Math.min(PAGE_SIZE, stateCount);

  useEffect(() => {
    if (isLoadingJobs || state === "schedulers") {
      setSlotContent(null);
      return;
    }
    if (isSearching) {
      setSlotContent(
        <span className="tabular-nums">
          {fetchedCount.toLocaleString()} matches
          {searchQuery.data && ` · scanned ${searchQuery.data.scanned.toLocaleString()}`}
        </span>,
      );
      return;
    }
    setSlotContent(
      <span className="tabular-nums">
        {fetchedCount.toLocaleString()} of {stateCount.toLocaleString()} loaded
        {isFetchingNextPage && (
          <span className="ml-2 inline-flex items-center gap-1">
            <RefreshCwIcon className="size-3 animate-spin" />
            Loading more
          </span>
        )}
      </span>,
    );
  }, [isLoadingJobs, state, fetchedCount, stateCount, isFetchingNextPage, setSlotContent, isSearching, searchQuery.data]);

  useEffect(() => {
    return () => setSlotContent(null);
  }, [setSlotContent]);

  useEffect(() => {
    if (state === "schedulers" || isSearching || isLoadingJobs || isFetchingNextPage) return;
    if (!hasNextPage || fetchedCount >= minJobsToLoad) return;
    void fetchNextPage();
  }, [
    state,
    isLoadingJobs,
    isFetchingNextPage,
    hasNextPage,
    fetchedCount,
    minJobsToLoad,
    fetchNextPage,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoadingJobs) return;

    const maybeLoadMore = () => {
      if (isSearching) return;
      if (!hasNextPageRef.current || isFetchingNextPageRef.current) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      const threshold = Math.max(
        LOAD_MORE_MIN_THRESHOLD_PX,
        el.clientHeight * 2,
      );
      if (remaining < threshold) {
        void fetchNextPage();
      }
    };

    el.addEventListener("scroll", maybeLoadMore, { passive: true });

    const resizeObserver = new ResizeObserver(maybeLoadMore);
    resizeObserver.observe(el);
    for (const child of el.children) {
      resizeObserver.observe(child);
    }

    maybeLoadMore();

    return () => {
      el.removeEventListener("scroll", maybeLoadMore);
      resizeObserver.disconnect();
    };
  }, [fetchNextPage, fetchedCount, state, isLoadingJobs, isSearching]);

  const closeJobSheet = () => {
    setSheetJobId(undefined);
    void navigate({
      to: "/$workspaceId/$environmentId/queues/$queueName",
      params: { workspaceId, environmentId, queueName },
      search: { redisInstanceId, state, q: debouncedSearch || undefined },
      replace: true,
    });
  };

  const openJobSheet = (id: string) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (hasJobDetailFields(job)) {
      queryClient.setQueryData(["job", redisInstanceId, queueName, id], job);
    }

    setSheetJobId(id);
    void navigate({
      to: "/$workspaceId/$environmentId/queues/$queueName",
      params: { workspaceId, environmentId, queueName },
      search: {
        redisInstanceId,
        state,
        jobId: id,
        q: debouncedSearch || undefined,
      },
      replace: true,
    });
  };

  const openJobSheetRef = useRef(openJobSheet);
  openJobSheetRef.current = openJobSheet;

  const selectState = (nextState: QueueJobFilterState) => {
    void navigate({
      to: "/$workspaceId/$environmentId/queues/$queueName",
      params: { workspaceId, environmentId, queueName },
      search: {
        redisInstanceId,
        state: nextState,
        q: debouncedSearch || undefined,
      },
    });
  };

  const TAB_HOTKEYS: QueueJobFilterState[] = ["latest", "failed", "errors", "active", "waiting"];
  const listMode = state !== "schedulers" && state !== "errors";

  useHotkeys({
    "/": () => {
      if (listMode) searchInputRef.current?.focus();
    },
    n: () => {
      if (canWrite) openAddJob();
    },
    j: () => listMode && setFocusIndex((i) => Math.min(jobs.length - 1, i + 1)),
    k: () => listMode && setFocusIndex((i) => Math.max(0, i - 1)),
    Enter: () => {
      const job = jobs[focusIndex];
      if (listMode && job) openJobSheet(job.id);
    },
    x: () => {
      const job = jobs[focusIndex];
      if (listMode && job) toggleSelect(job.id);
    },
    Escape: () => {
      if (selected.size > 0) setSelected(new Set());
      else if (searchInput) setSearchInput("");
    },
    ...Object.fromEntries(
      TAB_HOTKEYS.map((tab, i) => [String(i + 1), () => selectState(tab)]),
    ),
  });

  const hasSelection = selected.size > 0;
  const allMatchSelected =
    hasSelection && (isSearching ? selected.size >= jobs.length : selected.size >= stateCount && stateCount > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <QueuePageHeader
        queueName={queueName}
        isPaused={queueMetaQuery.data?.isPaused ?? cachedQueue?.isPaused ?? false}
        counts={queueMetaQuery.data?.counts ?? cachedQueue?.counts}
        workers={queueMetaQuery.data?.workers ?? cachedQueue?.workers}
        redisNickname={redisNickname}
        isFetching={isFetching}
        canWrite={canWrite}
        onAddJob={openAddJob}
        onCopyLink={copyQueueLink}
        onAction={(action) => {
          if (action === "refresh") {
            refresh();
            return;
          }
          setPendingAction(action);
        }}
      />
      <QueueActionDialog
        open={pendingAction !== null}
        action={pendingAction}
        queueName={queueName}
        onConfirm={() => {
          if (pendingAction) void executeAction(pendingAction);
          setPendingAction(null);
        }}
        onCancel={() => setPendingAction(null)}
      />

      <div className="shrink-0 border-b">
        <QueueMetricsPanel
          window={metricsWindow}
          metrics={metricsQuery.data}
          waitingJobs={
            queueMetaQuery.data?.counts.waiting ??
            cachedQueue?.counts.waiting ??
            0
          }
          workers={
            queueMetaQuery.data?.workers ??
            cachedQueue?.workers ??
            0
          }
          isLoading={metricsQuery.isLoading}
          onWindowChange={setMetricsWindow}
        />
        <QueueHistoryPanel
          redisInstanceId={redisInstanceId}
          queueName={queueName}
          window={metricsWindow}
        />
      </div>

      <QueueStateTabs
        state={state}
        counts={queueMetaQuery.data?.counts}
        isLoading={queueMetaQuery.isLoading}
        onStateChange={selectState}
      />

      {listMode && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-b px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchInput("");
                    e.currentTarget.blur();
                  }
                  if (e.key === "Enter") {
                    const first = jobs[0];
                    if (first && first.id === searchInput.trim()) openJobSheet(first.id);
                    e.currentTarget.blur();
                    setFocusIndex(0);
                  }
                }}
                placeholder="Search by job ID, name, error or payload"
                className="h-8 pr-8 pl-8 text-xs"
                aria-label="Search jobs"
              />
              {searchInput ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchInput("")}
                  aria-label="Clear search"
                >
                  {searchQuery.isFetching ? (
                    <RefreshCwIcon className="size-3.5 animate-spin" />
                  ) : (
                    <XIcon className="size-3.5" />
                  )}
                </button>
              ) : (
                <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
              )}
            </div>
            <div className="hidden min-w-0 items-center gap-3 text-xs sm:flex">
              {hasSelection ? (
                <>
                  <span className="text-foreground tabular-nums">
                    {selected.size.toLocaleString()} selected
                  </span>
                  {!allMatchSelected && !isSearching ? (
                    <button
                      type="button"
                      disabled={selectingAll}
                      className="flex items-center gap-1 text-primary underline-offset-2 hover:underline disabled:opacity-50"
                      onClick={() => void selectAll()}
                    >
                      {selectingAll && <RefreshCwIcon className="size-3 animate-spin" />}
                      Select all {stateCount.toLocaleString()}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                </>
              ) : isSearching ? (
                <span className="truncate text-muted-foreground">
                  {searchQuery.isPending
                    ? "Searching…"
                    : `${jobs.length.toLocaleString()} ${jobs.length === 1 ? "match" : "matches"}`}
                  {searchQuery.data?.truncated && (
                    <span title="Search inspects the newest 2,000 jobs per state (500 per state on the Latest tab)">
                      {" "}· partial scan
                    </span>
                  )}
                </span>
              ) : (
                <span className="hidden text-muted-foreground/70 lg:inline">
                  <Kbd>j</Kbd> <Kbd>k</Kbd> to move · <Kbd>x</Kbd> to select · <Kbd>?</Kbd> for more
                </span>
              )}
            </div>
          </div>
          {canWrite && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={!hasSelection || !!bulkBusy}
                loading={bulkBusy === "retry"}
                onClick={() => void bulkRetry()}
              >
                <RotateCcwIcon />
                Retry{hasSelection ? ` (${selected.size.toLocaleString()})` : ""}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasSelection || !!bulkBusy}
                loading={bulkBusy === "replay"}
                onClick={() => void bulkReplay()}
                title="Enqueue copies of the selected jobs"
              >
                <CopyIcon />
                Replay{hasSelection ? ` (${selected.size.toLocaleString()})` : ""}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!hasSelection || !!bulkBusy}
                loading={bulkBusy === "remove"}
                onClick={() => void bulkRemove()}
              >
                <Trash2Icon />
                Remove{hasSelection ? ` (${selected.size.toLocaleString()})` : ""}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t bg-card">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-none"
        >
          {state === "schedulers" ? (
            <SchedulerList
              schedulers={schedulersQuery.data ?? []}
              isLoading={schedulersQuery.isLoading}
              canWrite={canWrite}
              onOpenScheduler={(id) => setSheetSchedulerId(id)}
              onRun={runScheduler}
              onEdit={(id) => setSheetSchedulerId(id)}
              onRemove={removeScheduler}
            />
          ) : state === "errors" ? (
            <FailedJobGroupsTable
              groups={errorsQuery.data ?? []}
              totalFailed={queueMetaQuery.data?.counts.failed ?? 0}
              isLoading={errorsQuery.isLoading}
              canWrite={canWrite}
              onOpenJob={openJobSheet}
              onRetryGroup={retryGroup}
              onRemoveGroup={removeGroup}
            />
          ) : isLoadingJobs ? (
            <QueueJobsTableSkeleton rows={QUEUE_TABLE_SKELETON_ROWS} />
          ) : (
            <QueueJobsTable
              jobs={jobs}
              selected={selected}
              activeJobId={sheetJobId}
              focusedIndex={focusIndex}
              onFocusIndex={setFocusIndex}
              emptyState={
                isEmpty
                  ? isSearching
                    ? {
                        title: `No jobs match "${debouncedSearch}"`,
                        description:
                          "Search checks job IDs, names, failure reasons and payloads. Try another term or switch to the Latest tab.",
                      }
                    : getQueueTabEmptyState(state)
                  : undefined
              }
              scrollRef={scrollRef}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onOpenJob={openJobSheet}
            />
          )}
        </div>
      </div>

      <AddJobDialog
        open={addJobOpen}
        onOpenChange={setAddJobOpen}
        redisInstanceId={redisInstanceId}
        queueName={queueName}
        prefill={addJobPrefill}
        knownJobNames={knownJobNames}
        onAdded={(newJobId) => {
          void queueMetaQuery.refetch();
          void jobsQuery.refetch();
          toast("Open the new job?", {
            action: {
              label: "Open",
              onClick: () => openJobSheetRef.current(newJobId),
            },
          });
        }}
      />

      <Sheet
        open={!!sheetJobId}
        onOpenChange={(open) => {
          if (!open) closeJobSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-2xl"
          aria-describedby={undefined}
        >
          {sheetJobId && (
            <JobDetailPanel
              workspaceId={workspaceId}
              environmentId={environmentId}
              redisInstanceId={redisInstanceId}
              queueName={queueName}
              jobId={sheetJobId}
              listJob={sheetListJob}
              canWrite={canWrite}
              onRemoved={closeJobSheet}
              onEditReplay={openEditReplay}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!sheetSchedulerId}
        onOpenChange={(open) => {
          if (!open) setSheetSchedulerId(undefined);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-2xl"
          aria-describedby={undefined}
        >
          {sheetSchedulerId && (
            <SchedulerDetailPanel
              redisInstanceId={redisInstanceId}
              queueName={queueName}
              schedulerId={sheetSchedulerId}
              canWrite={canWrite}
              onRemoved={() => setSheetSchedulerId(undefined)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
