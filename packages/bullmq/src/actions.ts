import type { Job } from "bullmq";
import type { RedisConnection } from "./redis-types.js";
import { withQueue } from "./queue-runner.js";
import type { AddJobInput } from "./types.js";

const BULK_CONCURRENCY = 8;

async function runBulkJobAction(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobIds: string[],
  action: (job: Job) => Promise<void>,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  await withQueue(connection, queueName, prefix, async (queue) => {
    for (let i = 0; i < jobIds.length; i += BULK_CONCURRENCY) {
      const chunk = jobIds.slice(i, i + BULK_CONCURRENCY);
      await Promise.all(
        chunk.map(async (jobId) => {
          try {
            const job = await queue.getJob(jobId);
            if (!job) throw new Error("Job not found");
            await action(job);
            succeeded.push(jobId);
          } catch {
            failed.push(jobId);
          }
        }),
      );
    }
  });

  return { succeeded, failed };
}

export async function retryJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    await job.retry();
  });
}

export async function removeJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    await job.remove();
  });
}

export async function promoteJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    await job.promote();
  });
}

export async function bulkRetry(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobIds: string[],
): Promise<{ succeeded: string[]; failed: string[] }> {
  return runBulkJobAction(connection, queueName, prefix, jobIds, (job) =>
    job.retry(),
  );
}

export async function bulkRemove(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobIds: string[],
): Promise<{ succeeded: string[]; failed: string[] }> {
  return runBulkJobAction(connection, queueName, prefix, jobIds, (job) =>
    job.remove(),
  );
}

export async function replayJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobId: string,
): Promise<{ newJobId: string }> {
  return withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    const newJob = await queue.add(job.name, job.data);
    return { newJobId: newJob.id ?? "" };
  });
}

export async function addJob(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  input: AddJobInput,
): Promise<{ jobId: string }> {
  return withQueue(connection, queueName, prefix, async (queue) => {
    const job = await queue.add(input.name, input.data, {
      delay: input.delay || undefined,
      priority: input.priority || undefined,
      attempts: input.attempts || undefined,
    });
    return { jobId: job.id ?? "" };
  });
}

export async function bulkReplay(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  jobIds: string[],
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  await withQueue(connection, queueName, prefix, async (queue) => {
    for (let i = 0; i < jobIds.length; i += BULK_CONCURRENCY) {
      const chunk = jobIds.slice(i, i + BULK_CONCURRENCY);
      await Promise.all(
        chunk.map(async (jobId) => {
          try {
            const job = await queue.getJob(jobId);
            if (!job) throw new Error("Job not found");
            await queue.add(job.name, job.data);
            succeeded.push(jobId);
          } catch {
            failed.push(jobId);
          }
        }),
      );
    }
  });

  return { succeeded, failed };
}

export async function pauseQueue(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, (queue) => queue.pause());
}

export async function resumeQueue(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, (queue) => queue.resume());
}

export async function drainQueue(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  delayed = false,
): Promise<void> {
  await withQueue(connection, queueName, prefix, (queue) =>
    queue.drain(delayed),
  );
}

export async function cleanQueue(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  grace: number,
  limit: number,
  type: "completed" | "failed" | "delayed" | "wait" | "paused",
): Promise<string[]> {
  return withQueue(connection, queueName, prefix, (queue) =>
    queue.clean(grace, limit, type),
  );
}

export async function obliterateQueue(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, (queue) =>
    queue.obliterate({ force: true }),
  );
}

export async function removeScheduler(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  schedulerId: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    await queue.removeJobScheduler(schedulerId);
  });
}

export async function runScheduler(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  schedulerId: string,
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    const scheduler = await queue.getJobScheduler(schedulerId);
    if (!scheduler) throw new Error("Scheduler not found");

    await queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: scheduler.pattern,
        every: scheduler.every,
        immediately: true,
      },
      {
        name: scheduler.name,
        data: { source: "manual-run", ranAt: new Date().toISOString() },
      },
    );
  });
}

export async function updateScheduler(
  connection: RedisConnection,
  queueName: string,
  prefix: string,
  schedulerId: string,
  updates: { pattern?: string; every?: number },
): Promise<void> {
  await withQueue(connection, queueName, prefix, async (queue) => {
    const existing = await queue.getJobScheduler(schedulerId);
    if (!existing) throw new Error("Scheduler not found");

    const pattern = updates.pattern ?? existing.pattern;
    const every = updates.every ?? existing.every;

    if (!pattern && !every) {
      throw new Error("Either pattern or every must be provided");
    }

    await queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: pattern ?? undefined,
        every: every ?? undefined,
        startDate: existing.startDate,
        endDate: existing.endDate,
        tz: existing.tz,
        limit: existing.limit,
      },
      {
        name: existing.name,
      },
    );
  });
}
