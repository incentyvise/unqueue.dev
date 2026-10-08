import { Job, type Queue } from "bullmq";
import type { RedisConnection } from "./redis-types.js";
import { withQueue } from "./queue-runner.js";
import type { QueuePoolContext } from "./queue-pool-context.js";
import { jobLogSchema } from "@unqueue/validators";
import type { FailedJobGroup, JobDetail, JobSearchResult, JobSummary, ParsedLog, QueueCounts, QueueMeta, SchedulerSummary } from "./types.js";

export async function getQueueMeta(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  pool?: QueuePoolContext,
): Promise<QueueMeta> {
  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
    const workerKey = `${prefix}:${queueName}:workers`;
    const [counts, isPaused, workerCount] = await Promise.all([
      queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "completed",
        "failed",
        "paused",
        "prioritized",
        "waiting-children",
        "repeat",
      ),
      queue.isPaused(),
      connection.hlen(workerKey),
    ]);

    const typedCounts = counts as Record<string, number>;

    return {
      name: queueName,
      isPaused,
      workers: workerCount,
      counts: {
        waiting: typedCounts.waiting ?? 0,
        active: typedCounts.active ?? 0,
        delayed: typedCounts.delayed ?? 0,
        completed: typedCounts.completed ?? 0,
        failed: typedCounts.failed ?? 0,
        paused: typedCounts.paused ?? 0,
        prioritized: typedCounts.prioritized ?? 0,
        "waiting-children": typedCounts["waiting-children"] ?? 0,
        schedulers: typedCounts.repeat ?? 0,
      },
    };
  },
    pool,
  );
}

const JOB_STATES = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;

export type JobState = (typeof JOB_STATES)[number];
export type JobListState = JobState | "all" | "schedulers";

async function toJobDetails(
  queue: Queue,
  jobs: (Job | undefined)[],
  knownState?: JobState,
): Promise<JobDetail[]> {
  const filtered = jobs.filter((job): job is Job => job != null);

  const details = await Promise.all(
    filtered.map(async (job) => {
      const [jobState, logsResult] = await Promise.all([
        knownState ?? job.getState(),
        job.id ? queue.getJobLogs(job.id) : Promise.resolve({ logs: [] }),
      ]);

      return {
        ...toJobSummary(job),
        state: jobState,
        payload: job.data,
        progress: job.progress,
        logs: logsResult.logs.map(parseLogLine),
      };
    }),
  );

  return details.sort((a, b) => b.timestamp - a.timestamp);
}

export async function listJobs(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  state: JobListState,
  start = 0,
  end = 49,
  pool?: QueuePoolContext,
): Promise<JobDetail[]> {
  if (state === "schedulers") {
    return [];
  }

  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
      if (state === "all") {
        // Get counts first to skip states with no jobs — avoids fetching
        // and deserializing 8×(end+1) job records when most states are empty.
        const rawCounts = await queue.getJobCounts(...JOB_STATES);
        const counts = rawCounts as Record<string, number>;
        const nonEmptyStates = JOB_STATES.filter((s) => (counts[s] ?? 0) > 0);
        if (nonEmptyStates.length === 0) return [];

        const pageSize = end - start + 1;
        const perStateCap = start + pageSize;
        const batches = await Promise.all(
          nonEmptyStates.map(async (jobState) => {
            const jobs = await queue.getJobs([jobState], 0, perStateCap, false);
            return toJobDetails(queue, jobs, jobState);
          }),
        );
        const seen = new Set<string>();
        const merged = batches
          .flat()
          .sort((a, b) => b.timestamp - a.timestamp)
          .filter((job) => {
            if (seen.has(job.id)) return false;
            seen.add(job.id);
            return true;
          });
        return merged.slice(start, start + pageSize);
      }

      const jobs = await queue.getJobs([state], start, end, false);
      return toJobDetails(queue, jobs, state);
    },
    pool,
  );
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_RE = /\b(?:0x)?[0-9a-f]{12,}\b/gi;
const QUOTED_RE = /(["'`])(?:(?!\1).){1,80}\1/g;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

/**
 * Collapses an error message into a grouping fingerprint by replacing
 * volatile tokens (ids, numbers, quoted values) with placeholders so that
 * "Order 123 not found" and "Order 456 not found" land in the same group.
 */
export function normalizeErrorMessage(reason: string | undefined): string {
  if (!reason) return "Unknown error";
  const firstLine = reason.split("\n")[0]!.trim();
  return (
    firstLine
      .replace(UUID_RE, "<uuid>")
      .replace(HEX_RE, "<hex>")
      .replace(QUOTED_RE, "<str>")
      .replace(NUMBER_RE, "<n>")
      .replace(/\s+/g, " ")
      .slice(0, 200) || "Unknown error"
  );
}

export function groupFailedJobs(
  jobs: Array<Pick<Job, "id" | "name" | "finishedOn" | "failedReason" | "stacktrace">>,
): FailedJobGroup[] {
  const groups = new Map<string, FailedJobGroup>();

  for (const job of jobs) {
    const message = normalizeErrorMessage(job.failedReason);
    const key = `${job.name}\u0000${message}`;
    const failedAt = job.finishedOn;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (job.id) existing.jobIds.push(job.id);
      if ((failedAt ?? 0) > (existing.latestFailedAt ?? 0)) {
        existing.latestFailedAt = failedAt;
        existing.latestJobId = job.id ?? "";
        existing.failedReason = job.failedReason;
        existing.stacktrace = job.stacktrace?.length ? job.stacktrace : undefined;
      }
      if (failedAt && (!existing.firstFailedAt || failedAt < existing.firstFailedAt)) {
        existing.firstFailedAt = failedAt;
      }
    } else {
      groups.set(key, {
        key,
        name: job.name,
        message,
        count: 1,
        jobIds: job.id ? [job.id] : [],
        latestJobId: job.id ?? "",
        latestFailedAt: failedAt,
        firstFailedAt: failedAt,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace?.length ? job.stacktrace : undefined,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.count - a.count || (b.latestFailedAt ?? 0) - (a.latestFailedAt ?? 0),
  );
}

export async function listFailedJobGroups(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  pool?: QueuePoolContext,
): Promise<FailedJobGroup[]> {
  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
      const jobs = await queue.getJobs(["failed"], 0, 999);
      return groupFailedJobs(jobs.filter((job): job is Job => job != null));
    },
    pool,
  );
}

const SEARCH_SCAN_LIMIT = 2000;
/** Lower per-state cap when searching every state at once. */
const SEARCH_SCAN_LIMIT_ALL = 500;
/** Payloads larger than this are not text-matched. */
const SEARCH_MAX_PAYLOAD_CHARS = 20_000;

function jobMatches(job: Job, needle: string): boolean {
  if (job.id?.toLowerCase().includes(needle)) return true;
  if (job.name.toLowerCase().includes(needle)) return true;
  if (job.failedReason?.toLowerCase().includes(needle)) return true;
  try {
    const data = JSON.stringify(job.data ?? null);
    if (
      data &&
      data.length <= SEARCH_MAX_PAYLOAD_CHARS &&
      data.toLowerCase().includes(needle)
    ) {
      return true;
    }
  } catch {
    // unserialisable payloads are skipped
  }
  return false;
}

/**
 * Searches jobs in a state by exact id, id/name substring, failed reason, or
 * payload text. Scans the newest SEARCH_SCAN_LIMIT jobs per state so a search
 * never walks an unbounded Redis set.
 */
export async function searchJobs(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  state: JobListState,
  query: string,
  limit = 100,
  pool?: QueuePoolContext,
): Promise<JobSearchResult> {
  const needle = query.trim().toLowerCase();
  if (!needle || state === "schedulers") {
    return { jobs: [], scanned: 0, truncated: false };
  }

  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
      const results: JobSummary[] = [];
      const seen = new Set<string>();

      const exact = await queue.getJob(query.trim());
      if (exact?.id) {
        const exactState = await exact.getState();
        if (state === "all" || exactState === state) {
          results.push({ ...toJobSummary(exact), state: exactState });
          seen.add(exact.id);
        }
      }

      const states: JobState[] = state === "all" ? [...JOB_STATES] : [state];
      const scanLimit = state === "all" ? SEARCH_SCAN_LIMIT_ALL : SEARCH_SCAN_LIMIT;
      let scanned = 0;
      let truncated = false;

      for (const jobState of states) {
        if (results.length >= limit) break;
        const jobs = await queue.getJobs([jobState], 0, scanLimit - 1, false);
        if (jobs.length >= scanLimit) truncated = true;
        for (const job of jobs) {
          if (!job?.id) continue;
          scanned++;
          if (seen.has(job.id) || !jobMatches(job, needle)) continue;
          seen.add(job.id);
          results.push({ ...toJobSummary(job), state: jobState });
          if (results.length >= limit) {
            truncated = true;
            break;
          }
        }
      }

      results.sort((a, b) => b.timestamp - a.timestamp);
      return { jobs: results, scanned, truncated };
    },
    pool,
  );
}

export function toJobSummary(job: Job): JobSummary {
  return {
    id: job.id ?? "",
    name: job.name,
    state: "",
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    delay: job.delay,
    priority: job.priority,
    stacktrace: job.stacktrace?.length ? job.stacktrace : undefined,
    returnValue: job.returnvalue,
    opts: {
      attempts: job.opts.attempts,
      backoff: job.opts.backoff,
      priority: job.opts.priority,
      delay: job.opts.delay,
      removeOnComplete: job.opts.removeOnComplete,
      removeOnFail: job.opts.removeOnFail,
    },
  };
}

export async function listJobIds(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  state: JobListState,
): Promise<string[]> {
  if (state === "schedulers") return [];

  const k = (s: string) => `${prefix}:${queueName}:${s}`;

  if (state === "all") {
    const pipeline = connection.pipeline();
    pipeline.lrange(k("wait"), 0, -1);
    pipeline.lrange(k("active"), 0, -1);
    pipeline.lrange(k("paused"), 0, -1);
    pipeline.zrange(k("delayed"), 0, -1);
    pipeline.zrange(k("completed"), 0, -1);
    pipeline.zrange(k("failed"), 0, -1);
    pipeline.zrange(k("prioritized"), 0, -1);
    pipeline.zrange(k("waiting-children"), 0, -1);
    const results = await pipeline.exec();
    const ids = new Set<string>();
    for (const result of results ?? []) {
      if (!result[0] && Array.isArray(result[1])) {
        for (const id of result[1] as string[]) ids.add(id);
      }
    }
    return [...ids];
  }

  const listKey = state === "waiting" ? "wait" : state;
  const listStates = ["waiting", "active", "paused"];
  if (listStates.includes(state)) {
    return connection.lrange(k(listKey), 0, -1);
  }

  return connection.zrange(k(state), 0, -1);
}

export async function getJobState(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<JobSummary | null> {
  return withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return { ...toJobSummary(job), state };
  });
}

export async function getJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<JobDetail | null> {
  return withQueue(connection, queueName, prefix, async (queue) => {
    const [job, logsResult] = await Promise.all([
      queue.getJob(jobId),
      queue.getJobLogs(jobId),
    ]);
    if (!job) return null;
    const jobState = await job.getState();
    return {
      ...toJobSummary(job),
      state: jobState,
      payload: job.data,
      progress: job.progress,
      logs: logsResult.logs.map(parseLogLine),
    };
  });
}

function parseLogLine(line: string): ParsedLog {
  try {
    const parsed = JSON.parse(line);
    const result = jobLogSchema.safeParse(parsed);
    if (result.success) {
      return { format: "json", entry: result.data };
    }
  } catch {
    // fall through
  }
  return { format: "raw", raw: line };
}

// BullMQ v5 key layout: {prefix}:{name}:{suffix}
// wait/active/paused use LLEN; everything else uses ZCARD.
// isPaused = HEXISTS {prefix}:{name}:meta paused
//
// Note: BullMQ v5 deprecated a "0:"-prefixed tail marker in the wait/paused
// lists (to be removed in v6). Fresh v5 queues don't have it. We skip the
// marker correction here since it's a minor off-by-1 on a legacy edge case.
const FIELDS_PER_QUEUE = 11;

export async function getQueueMetaBatch(
  connection: RedisConnection,
  queueNames: string[],
  prefix: string,
): Promise<QueueMeta[]> {
  if (queueNames.length === 0) return [];

  const pipeline = connection.pipeline();
  for (const name of queueNames) {
    const k = (s: string) => `${prefix}:${name}:${s}`;
    pipeline.llen(k("wait"));               // 0 waiting
    pipeline.llen(k("active"));             // 1 active
    pipeline.zcard(k("delayed"));           // 2 delayed
    pipeline.zcard(k("completed"));         // 3 completed
    pipeline.zcard(k("failed"));            // 4 failed
    pipeline.llen(k("paused"));             // 5 paused
    pipeline.zcard(k("prioritized"));       // 6 prioritized
    pipeline.zcard(k("waiting-children"));  // 7 waiting-children
    pipeline.zcard(k("repeat"));            // 8 schedulers
    pipeline.hexists(k("meta"), "paused");  // 9 isPaused
    pipeline.hlen(k("workers"));            // 10 workers
  }

  const results = await pipeline.exec();

  const num = (i: number): number => {
    const entry = results?.[i];
    return entry && !entry[0] ? (entry[1] as number) : 0;
  };
  const bool = (i: number): boolean => {
    const entry = results?.[i];
    return entry && !entry[0] ? entry[1] === 1 : false;
  };

  return queueNames.map((name, qi) => {
    const o = qi * FIELDS_PER_QUEUE;
    const counts: QueueCounts = {
      waiting: num(o + 0),
      active: num(o + 1),
      delayed: num(o + 2),
      completed: num(o + 3),
      failed: num(o + 4),
      paused: num(o + 5),
      prioritized: num(o + 6),
      "waiting-children": num(o + 7),
      schedulers: num(o + 8),
    };
    return { name, isPaused: bool(o + 9), workers: num(o + 10), counts };
  });
}

function toSchedulerSummary(scheduler: { key: string; name: string; pattern?: string; every?: number; immediately?: boolean; startDate?: number; endDate?: number; tz?: string; limit?: number; prevMillis?: number; nextMillis?: number; count?: number; template?: { data?: unknown; opts?: Record<string, unknown> } }): SchedulerSummary {
  return {
    id: scheduler.key,
    name: scheduler.name,
    pattern: scheduler.pattern,
    every: scheduler.every,
    immediately: scheduler.immediately,
    startDate: scheduler.startDate,
    endDate: scheduler.endDate,
    tz: scheduler.tz,
    limit: scheduler.limit,
    prevMillis: scheduler.prevMillis,
    nextMillis: scheduler.nextMillis,
    count: scheduler.count,
    opts: scheduler.template?.opts
      ? {
          jobId: typeof scheduler.template.opts.jobId === "string" ? scheduler.template.opts.jobId as string : undefined,
          priority: typeof scheduler.template.opts.priority === "number" ? scheduler.template.opts.priority as number : undefined,
          attempts: typeof scheduler.template.opts.attempts === "number" ? scheduler.template.opts.attempts as number : undefined,
          backoff: scheduler.template.opts.backoff,
          removeOnComplete: scheduler.template.opts.removeOnComplete,
          removeOnFail: scheduler.template.opts.removeOnFail,
        }
      : undefined,
  };
}

export async function listSchedulers(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  pool?: QueuePoolContext,
): Promise<SchedulerSummary[]> {
  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
      const schedulers = await queue.getJobSchedulers();
      return schedulers.map(toSchedulerSummary);
    },
    pool,
  );
}

export async function getScheduler(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  schedulerId: string,
  pool?: QueuePoolContext,
): Promise<SchedulerSummary | null> {
  return withQueue(
    connection,
    queueName,
    prefix,
    async (queue) => {
      try {
        const scheduler = await queue.getJobScheduler(schedulerId);
        if (!scheduler) return null;
        return toSchedulerSummary(scheduler);
      } catch {
        return null;
      }
    },
    pool,
  );
}
