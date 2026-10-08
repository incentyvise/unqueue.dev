import {
  addJob,
  bulkRemove,
  bulkReplay,
  bulkRetry,
  promoteJob,
  removeJob,
  replayJob,
  retryJob,
} from "@unqueue/bullmq";
import type { Logger } from "@unqueue/logger";
import type { ServiceDeps } from "../context.js";
import { ServiceError } from "../errors.js";
import { assertRedisInstanceAccess } from "../rbac.js";
import type { Actor } from "../types.js";

export function createJobActionsService(deps: ServiceDeps, logger: Logger) {
  async function getConnection(actor: Actor, redisInstanceId: string) {
    await assertRedisInstanceAccess(
      deps.db,
      actor.userId,
      redisInstanceId,
      "member",
    );
    await deps.redisInstances.ensureRegistered(redisInstanceId);
    return deps.realtime.getConnection(redisInstanceId);
  }

  return {
    async retry(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobId: string;
      },
    ) {
      logger.info(input, "Retrying job");

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      await retryJob(connection, input.queueName, prefix, input.jobId);
      return { ok: true as const };
    },

    async remove(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobId: string;
      },
    ) {
      logger.info(input, "Removing job");

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      try {
        await removeJob(connection, input.queueName, prefix, input.jobId);
      } catch (error) {
        if (error instanceof Error && error.message.includes("locked by another worker")) {
          throw new ServiceError("BAD_REQUEST", "Cannot remove an active job that is currently being processed");
        }
        throw error;
      }
      return { ok: true as const };
    },

    async promote(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobId: string;
      },
    ) {
      logger.info(input, "Promoting job");

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      await promoteJob(connection, input.queueName, prefix, input.jobId);
      return { ok: true as const };
    },

    async add(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        name: string;
        data: unknown;
        delay?: number;
        priority?: number;
        attempts?: number;
      },
    ) {
      logger.info(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          name: input.name,
        },
        "Adding job",
      );

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      const { redisInstanceId: _r, queueName, ...job } = input;
      return addJob(connection, queueName, prefix, job);
    },

    async bulkRetry(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobIds: string[];
      },
    ) {
      logger.info(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          count: input.jobIds.length,
        },
        "Bulk retrying jobs",
      );

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return bulkRetry(connection, input.queueName, prefix, input.jobIds);
    },

    async replay(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobId: string;
      },
    ) {
      logger.info(input, "Replaying job");

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return replayJob(connection, input.queueName, prefix, input.jobId);
    },

    async bulkReplay(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobIds: string[];
      },
    ) {
      logger.info(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          count: input.jobIds.length,
        },
        "Bulk replaying jobs",
      );

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return bulkReplay(connection, input.queueName, prefix, input.jobIds);
    },

    async bulkRemove(
      actor: Actor,
      input: {
        redisInstanceId: string;
        queueName: string;
        jobIds: string[];
      },
    ) {
      logger.info(
        {
          redisInstanceId: input.redisInstanceId,
          queueName: input.queueName,
          count: input.jobIds.length,
        },
        "Bulk removing jobs",
      );

      const { connection, prefix } = await getConnection(
        actor,
        input.redisInstanceId,
      );
      return bulkRemove(connection, input.queueName, prefix, input.jobIds);
    },
  };
}

export type JobActionsService = ReturnType<typeof createJobActionsService>;
