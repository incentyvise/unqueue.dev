import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { queueMetricSnapshots, redisInstances } from "@unqueue/db/schema";
import type { Logger } from "@unqueue/logger";
import type { ServiceDeps } from "../context.js";
import { assertEnvironmentAccess, assertRedisInstanceAccess } from "../rbac.js";
import type { Actor } from "../types.js";

export function createStatsService(deps: ServiceDeps, logger: Logger) {
  return {
    async getQueueHistory(
      actor: Actor,
      input: { redisInstanceId: string; queueName: string; hours?: number },
    ) {
      await assertRedisInstanceAccess(
        deps.db,
        actor.userId,
        input.redisInstanceId,
        "viewer",
      );

      const hours = input.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60_000);

      logger.debug(input, "Getting queue history");

      return deps.db
        .select()
        .from(queueMetricSnapshots)
        .where(
          and(
            eq(queueMetricSnapshots.redisInstanceId, input.redisInstanceId),
            eq(queueMetricSnapshots.queueName, input.queueName),
            gte(queueMetricSnapshots.snapshotAt, since),
          ),
        )
        .orderBy(asc(queueMetricSnapshots.snapshotAt));
    },

    /**
     * Environment-wide time series built from per-queue minute snapshots.
     * Each minute is summed across queues, then minutes are averaged into
     * buckets sized so the chart has at most ~120 points.
     */
    async getEnvironmentHistory(
      actor: Actor,
      input: { environmentId: string; hours?: number },
    ) {
      await assertEnvironmentAccess(
        deps.db,
        actor.userId,
        input.environmentId,
        "viewer",
      );

      const hours = input.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60_000);
      const bucketSeconds = Math.max(60, Math.ceil((hours * 3600) / 120 / 60) * 60);

      const instances = await deps.db
        .select({ id: redisInstances.id })
        .from(redisInstances)
        .where(eq(redisInstances.environmentId, input.environmentId));
      const instanceIds = instances.map((i) => i.id);
      if (instanceIds.length === 0) {
        return { bucketSeconds, points: [] };
      }

      logger.debug({ ...input, bucketSeconds }, "Getting environment history");

      const perMinute = deps.db
        .select({
          snapshotAt: queueMetricSnapshots.snapshotAt,
          throughput: sql<number>`sum(${queueMetricSnapshots.throughputPerMinute})`.as("throughput"),
          failedPerMin: sql<number>`sum(${queueMetricSnapshots.failedInWindow}) / 5.0`.as("failed_per_min"),
          completedPerMin: sql<number>`sum(${queueMetricSnapshots.completedInWindow}) / 5.0`.as("completed_per_min"),
          backlog: sql<number>`sum(${queueMetricSnapshots.waiting} + ${queueMetricSnapshots.delayed})`.as("backlog"),
          active: sql<number>`sum(${queueMetricSnapshots.active})`.as("active"),
          p95RuntimeMs: sql<number>`max(${queueMetricSnapshots.p95RuntimeMs})`.as("p95_runtime_ms"),
        })
        .from(queueMetricSnapshots)
        .where(
          and(
            inArray(queueMetricSnapshots.redisInstanceId, instanceIds),
            gte(queueMetricSnapshots.snapshotAt, since),
          ),
        )
        .groupBy(queueMetricSnapshots.snapshotAt)
        .as("per_minute");

      // bucketSeconds is a server-computed integer, so it's safe to inline and
      // avoids Postgres inferring odd parameter types inside to_timestamp().
      const bucketSize = sql.raw(String(bucketSeconds));
      const bucket = sql<Date>`to_timestamp(floor(extract(epoch from ${perMinute.snapshotAt}) / ${bucketSize}) * ${bucketSize})`;

      const rows = await deps.db
        .select({
          t: bucket.as("t"),
          throughput: sql<number>`avg(${perMinute.throughput})::float8`,
          failedPerMin: sql<number>`avg(${perMinute.failedPerMin})::float8`,
          completedPerMin: sql<number>`avg(${perMinute.completedPerMin})::float8`,
          backlog: sql<number>`avg(${perMinute.backlog})::float8`,
          active: sql<number>`avg(${perMinute.active})::float8`,
          p95RuntimeMs: sql<number>`max(${perMinute.p95RuntimeMs})::float8`,
        })
        .from(perMinute)
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      return {
        bucketSeconds,
        points: rows.map((row) => {
          const finished = Number(row.completedPerMin) + Number(row.failedPerMin);
          return {
            t: new Date(row.t).getTime(),
            throughput: Number(row.throughput),
            failedPerMin: Number(row.failedPerMin),
            completedPerMin: Number(row.completedPerMin),
            failureRate: finished > 0 ? Number(row.failedPerMin) / finished : 0,
            backlog: Number(row.backlog),
            active: Number(row.active),
            p95RuntimeMs: Number(row.p95RuntimeMs),
          };
        }),
      };
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
