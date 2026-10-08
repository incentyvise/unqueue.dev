export type ParsedLog = {
  format: "json" | "raw";
  entry?: {
    ts: number;
    level: string;
    message: string;
    metadata?: Record<string, unknown>;
  };
  raw?: string;
};

export type JobSummary = {
  id: string;
  name: string;
  state: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade: number;
  failedReason?: string;
  delay?: number;
  priority?: number;
  stacktrace?: string[];
  returnValue?: unknown;
  opts?: {
    attempts?: number;
    backoff?: unknown;
    priority?: number;
    delay?: number;
    removeOnComplete?: unknown;
    removeOnFail?: unknown;
  };
};

export type JobDetail = JobSummary & {
  payload: unknown;
  progress: unknown;
  logs: ParsedLog[];
};

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  prioritized: number;
  "waiting-children": number;
  schedulers: number;
};

export type QueueMeta = {
  name: string;
  isPaused: boolean;
  counts: QueueCounts;
  workers: number;
};

export type FailedJobGroup = {
  /** Stable key: job name + normalised error message. */
  key: string;
  name: string;
  /** Normalised error message used for grouping (numbers/ids replaced). */
  message: string;
  count: number;
  jobIds: string[];
  firstFailedAt?: number;
  latestJobId: string;
  latestFailedAt?: number;
  failedReason?: string;
  stacktrace?: string[];
};

export type SchedulerSummary = {
  id: string;
  name: string;
  pattern?: string;
  every?: number;
  immediately?: boolean;
  startDate?: number;
  endDate?: number;
  tz?: string;
  limit?: number;
  prevMillis?: number;
  nextMillis?: number;
  count?: number;
  opts?: {
    jobId?: string;
    priority?: number;
    attempts?: number;
    backoff?: unknown;
    removeOnComplete?: unknown;
    removeOnFail?: unknown;
  };
};

export type RedisInstanceConfig = {
  id: string;
  workspaceId: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
  tlsServername?: string;
  bullmqPrefix: string;
};

export type JobSearchResult = {
  jobs: JobSummary[];
  /** Number of jobs inspected while searching. */
  scanned: number;
  /** True when the scan limit was hit before inspecting every job. */
  truncated: boolean;
};

export type AddJobInput = {
  name: string;
  data: unknown;
  delay?: number;
  priority?: number;
  attempts?: number;
};
