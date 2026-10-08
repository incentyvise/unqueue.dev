import {
  getJob,
  listFailedJobGroups,
  listJobs,
  listJobIds,
  searchJobs,
  type JobListState,
} from "@unqueue/bullmq";
import type { Logger } from "@unqueue/logger";
import type { ServiceDeps } from "../context.js";
import { notFound } from "../errors.js";
import { assertRedisInstanceAccess } from "../rbac.js";
import type { Actor } from "../types.js";

export function createJobService(deps: ServiceDeps, logger: Logger) {
  async function getConnection(actor: Actor, redisInstanceId: string) {
    await assertRedisInstanceAccess(
      deps.db,
      actor.userId,
      redisInstanceId,
      "viewer",
    );
    await deps.redisInstances.ensureRegistered(redisInstanceId);
    return deps.realtime.getConnection(redisInstanceId);
  }

  return {
    async list(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        state: JobListState;
        start: number;
        end: number;
      },
    ) {
      logger.debug(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          state: input.state,
        },
        "Listing jobs",
      );

      const { connection, prefix, queuePool } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return listJobs(
        connection,
        input.queueName,
        prefix,
        input.state,
        input.start,
        input.end,
        queuePool,
      );
    },

    async listIds(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        state: JobListState;
      },
    ) {
      const { connection, prefix } = await getConnection(actor, input.redisInstanceId);
      return listJobIds(connection, input.queueName, prefix, input.state);
    },

    async listFailedGroups(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
      },
    ) {
      logger.debug(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
        },
        "Listing failed job groups",
      );

      const { connection, prefix, queuePool } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return listFailedJobGroups(
        connection,
        input.queueName,
        prefix,
        queuePool,
      );
    },

    async search(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        state: JobListState;
        query: string;
        limit?: number;
      },
    ) {
      logger.debug(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          state: input.state,
        },
        "Searching jobs",
      );

      const { connection, prefix, queuePool } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return searchJobs(
        connection,
        input.queueName,
        prefix,
        input.state,
        input.query,
        input.limit,
        queuePool,
      );
    },

    async get(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobId: string;
      },
    ) {
      logger.debug(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          jobId: input.jobId,
        },
        "Getting job",
      );

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      const job = await getJob(
        connection,
        input.queueName,
        prefix,
        input.jobId,
      );

      if (!job) notFound("Job");
      return job;
    },
  };
}

export type JobService = ReturnType<typeof createJobService>;
