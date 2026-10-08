import type { EnvironmentQueueRow } from "@/components/environment-queues-table";

export type QueueHealth = "failed" | "paused" | "backlog" | "active" | "idle";

type QueueHealthInput = Pick<EnvironmentQueueRow, "isPaused"> & {
  counts: Pick<EnvironmentQueueRow["counts"], "failed" | "waiting" | "delayed" | "active">;
};

export const BACKLOG_THRESHOLD = 10;

export function getQueueHealth(queue: QueueHealthInput): QueueHealth {
  if (queue.isPaused) return "paused";
  if (queue.counts.failed > 0) return "failed";
  if (queue.counts.waiting + queue.counts.delayed >= BACKLOG_THRESHOLD) return "backlog";
  if (queue.counts.active > 0) return "active";
  return "idle";
}

export const QUEUE_HEALTH_META: Record<
  QueueHealth,
  { label: string; dot: string; text: string; description: string }
> = {
  failed: {
    label: "Failing",
    dot: "bg-destructive",
    text: "text-destructive",
    description: "Has failed jobs",
  },
  paused: {
    label: "Paused",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    description: "Processing is halted",
  },
  backlog: {
    label: "Backlog",
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    description: `${BACKLOG_THRESHOLD}+ jobs waiting or delayed`,
  },
  active: {
    label: "Processing",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    description: "Jobs are running",
  },
  idle: {
    label: "Idle",
    dot: "bg-emerald-500/60",
    text: "text-emerald-600 dark:text-emerald-400",
    description: "Nothing waiting, nothing failing",
  },
};

export function queueKey(queue: { redisInstanceId: string; name: string }) {
  return `${queue.redisInstanceId}:${queue.name}`;
}
