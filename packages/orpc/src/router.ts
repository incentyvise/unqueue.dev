import { os } from "@orpc/server";
import { z } from "zod";
import { ROLES } from "@unqueue/shared";
import {
  alertConditionSchema,
  redisInstanceInputSchema,
} from "@unqueue/validators";
import type { Actor } from "@unqueue/services";
import {
  authed,
  requireRole,
  rpcLogging,
  serviceErrors,
} from "./middleware.js";
import type { ServerContext } from "./context.js";

const base = os.$context<ServerContext>().use(rpcLogging).use(serviceErrors);

function toActor(context: ServerContext): Actor {
  return {
    userId: context.user!.id,
    email: context.user!.email,
    name: context.user!.name,
    membership: context.membership,
  };
}

const workspaceRouter = {
  list: base.use(authed).handler(async ({ context }) => {
    return context.services.workspace.list(toActor(context));
  }),

  create: base
    .input(z.object({ name: z.string().min(1).max(64) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.workspace.create(
        toActor(context),
        input.name,
      );
    }),

  get: base
    .input(z.object({ workspaceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.workspace.get(
        toActor(context),
        input.workspaceId,
      );
    }),

  rename: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        name: z.string().min(1).max(64),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.workspace.rename(
        toActor(context),
        input.workspaceId,
        input.name,
      );
    }),
};

const membersRouter = {
  list: base
    .input(z.object({ workspaceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.members.list(input.workspaceId);
    }),

  listInvites: base
    .input(z.object({ workspaceId: z.string().length(24) }))
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.listInvites(input.workspaceId);
    }),

  invite: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        email: z.string().email(),
        role: z
          .enum(ROLES)
          .refine((r) => r !== "owner", "Cannot invite as owner"),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.invite({
        ...input,
        invitedBy: context.user!.id,
      });
    }),

  updateRole: base
    .input(
      z.object({
        memberId: z.string().length(24),
        role: z
          .enum(ROLES)
          .refine((r) => r !== "owner", "Cannot assign owner role"),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.updateRole(
        toActor(context),
        input.memberId,
        input.role,
      );
    }),

  remove: base
    .input(z.object({ memberId: z.string().length(24) }))
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.remove(toActor(context), input.memberId);
    }),

  updateInvite: base
    .input(
      z.object({
        inviteId: z.string().length(24),
        role: z
          .enum(ROLES)
          .refine((r) => r !== "owner", "Cannot assign owner role"),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.updateInvite(
        toActor(context),
        input.inviteId,
        input.role,
      );
    }),

  revokeInvite: base
    .input(z.object({ inviteId: z.string().length(24) }))
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.members.revokeInvite(
        toActor(context),
        input.inviteId,
      );
    }),
};

const environmentRouter = {
  list: base
    .input(z.object({ workspaceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.environment.list(input.workspaceId);
    }),

  create: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        name: z.string().trim().min(1).max(100),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.environment.create(input);
    }),

  rename: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        id: z.string().length(24),
        name: z.string().trim().min(1).max(100),
      }),
    )
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.environment.rename(input);
    }),
};

const redisRouter = {
  list: base
    .input(z.object({ environmentId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.list(toActor(context), input.environmentId);
    }),

  create: base
    .input(
      z.object({
        environmentId: z.string().length(24),
        ...redisInstanceInputSchema.shape,
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.create(toActor(context), input);
    }),

  testConnection: base
    .input(
      redisInstanceInputSchema.extend({
        id: z.string().length(24).optional(),
        environmentId: z.string().length(24).optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.testConnection(toActor(context), input);
    }),

  update: base
    .input(
      z.object({
        id: z.string().length(24),
        ...redisInstanceInputSchema.shape,
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.update(toActor(context), input);
    }),

  delete: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.delete(toActor(context), input.id);
    }),

  getClientCounts: base
    .input(z.object({ environmentId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.getClientCounts(
        toActor(context),
        input.environmentId,
      );
    }),

  getClients: base
    .input(z.object({ redisInstanceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.redis.getClients(toActor(context), input);
    }),
};

const metricsWindowSchema = z.enum(["1m", "5m", "15m", "1h", "24h", "7d"]);

const queueRouter = {
  list: base
    .input(z.object({ redisInstanceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queue.list(
        toActor(context),
        input.redisInstanceId,
      );
    }),

  listForEnvironment: base
    .input(
      z.object({
        environmentId: z.string().length(24),
        forceRefresh: z.boolean().optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queue.listForEnvironment(toActor(context), input);
    }),

  getMeta: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        forceRefresh: z.boolean().optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queue.getMeta(toActor(context), input);
    }),

  getMetrics: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        window: metricsWindowSchema.default("1h"),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queue.getMetrics(toActor(context), input);
    }),

  refreshDiscovery: base
    .input(z.object({ redisInstanceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queue.refreshDiscovery(
        toActor(context),
        input.redisInstanceId,
      );
    }),
};

const jobRouter = {
  listIds: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        state: z.enum([
          "all",
          "waiting",
          "active",
          "delayed",
          "completed",
          "failed",
          "paused",
          "prioritized",
          "waiting-children",
          "schedulers",
        ]),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.job.listIds(toActor(context), input);
    }),

  list: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        state: z.enum([
          "all",
          "waiting",
          "active",
          "delayed",
          "completed",
          "failed",
          "paused",
          "prioritized",
          "waiting-children",
          "schedulers",
        ]),
        start: z.number().int().min(0).default(0),
        end: z.number().int().min(0).default(49),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.job.list(toActor(context), input);
    }),

  get: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        jobId: z.string(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.job.get(toActor(context), input);
    }),

  search: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        state: z.enum([
          "all",
          "waiting",
          "active",
          "delayed",
          "completed",
          "failed",
          "paused",
          "prioritized",
          "waiting-children",
          "schedulers",
        ]),
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.job.search(toActor(context), input);
    }),

  listFailedGroups: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.job.listFailedGroups(toActor(context), input);
    }),
};

const jobActionInput = z.object({
  redisInstanceId: z.string().length(24),
  queueName: z.string(),
  jobId: z.string(),
});

const bulkJobActionInput = z.object({
  redisInstanceId: z.string().length(24),
  queueName: z.string(),
  jobIds: z.array(z.string()).min(1),
});

const queueActionInput = z.object({
  redisInstanceId: z.string().length(24),
  queueName: z.string(),
});

const jobActionsRouter = {
  add: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
        name: z.string().trim().min(1).max(200),
        data: z.unknown(),
        delay: z.number().int().min(0).max(365 * 24 * 60 * 60_000).optional(),
        priority: z.number().int().min(0).max(2_097_152).optional(),
        attempts: z.number().int().min(1).max(100).optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.add(toActor(context), {
        ...input,
        data: input.data ?? {},
      });
    }),

  retry: base
    .input(jobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.retry(toActor(context), input);
    }),

  remove: base
    .input(jobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.remove(toActor(context), input);
    }),

  promote: base
    .input(jobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.promote(toActor(context), input);
    }),

  bulkRetry: base
    .input(bulkJobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.bulkRetry(toActor(context), input);
    }),

  replay: base
    .input(jobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.replay(toActor(context), input);
    }),

  bulkReplay: base
    .input(bulkJobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.bulkReplay(toActor(context), input);
    }),

  bulkRemove: base
    .input(bulkJobActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.jobActions.bulkRemove(toActor(context), input);
    }),
};

const queueAdminRouter = {
  pause: base
    .input(queueActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queueAdmin.pause(toActor(context), input);
    }),

  resume: base
    .input(queueActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queueAdmin.resume(toActor(context), input);
    }),

  drain: base
    .input(queueActionInput.extend({ delayed: z.boolean().default(false) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queueAdmin.drain(toActor(context), input);
    }),

  clean: base
    .input(
      queueActionInput.extend({
        grace: z.number().default(0),
        limit: z.number().default(1000),
        type: z.enum(["completed", "failed", "delayed", "wait", "paused"]),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queueAdmin.clean(toActor(context), input);
    }),

  obliterate: base
    .input(queueActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.queueAdmin.obliterate(toActor(context), input);
    }),
};

const schedulerActionInput = z.object({
  redisInstanceId: z.string().length(24),
  queueName: z.string(),
  schedulerId: z.string(),
});

const schedulerRouter = {
  list: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.scheduler.list(toActor(context), input);
    }),

  get: base
    .input(schedulerActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.scheduler.get(toActor(context), input);
    }),

  run: base
    .input(schedulerActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.scheduler.run(toActor(context), input);
    }),

  remove: base
    .input(schedulerActionInput)
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.scheduler.remove(toActor(context), input);
    }),

  update: base
    .input(
      schedulerActionInput.extend({
        pattern: z.string().optional(),
        every: z.number().int().min(1).optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.scheduler.update(toActor(context), input);
    }),
};

const bookmarkRouter = {
  listFolders: base
    .input(z.object({ workspaceId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.listFolders(
        toActor(context),
        input.workspaceId,
      );
    }),

  createFolder: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        name: z.string().trim().min(1).max(100),
        isShared: z.boolean().optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.createFolder(toActor(context), input);
    }),

  updateFolder: base
    .input(
      z.object({
        id: z.string().length(24),
        name: z.string().trim().min(1).max(100).optional(),
        isShared: z.boolean().optional(),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.updateFolder(toActor(context), input);
    }),

  deleteFolder: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.deleteFolder(toActor(context), input.id);
    }),

  listBookmarks: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        folderId: z.string().length(24),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.listBookmarks(toActor(context), input);
    }),

  getBookmark: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.getBookmark(toActor(context), input.id);
    }),

  createBookmark: base
    .input(
      z.object({
        workspaceId: z.string().length(24),
        folderId: z.string().length(24),
        redisInstanceId: z.string().length(24),
        queueName: z.string().min(1),
        jobId: z.string().min(1),
        environmentId: z.string().length(24),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.createBookmark(toActor(context), input);
    }),

  deleteBookmark: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.deleteBookmark(
        toActor(context),
        input.id,
      );
    }),

  createNote: base
    .input(
      z.object({
        bookmarkId: z.string().length(24),
        body: z.string().trim().min(1).max(5000),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.createNote(toActor(context), input);
    }),

  updateNote: base
    .input(
      z.object({
        id: z.string().length(24),
        body: z.string().trim().min(1).max(5000),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.updateNote(toActor(context), input);
    }),

  deleteNote: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.bookmark.deleteNote(toActor(context), input.id);
    }),
};

const alertRouter = {
  list: base
    .input(z.object({ environmentId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.alert.list(toActor(context), input.environmentId);
    }),

  create: base
    .input(
      z.object({
        environmentId: z.string().length(24),
        redisInstanceId: z.string().length(24),
        name: z.string().min(1),
        queueName: z.string().min(1),
        webhookUrl: z.string().url(),
        condition: alertConditionSchema,
        intervalMinutes: z.number().int().min(1).default(15),
        cooldownMinutes: z.number().int().min(1).default(15),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.alert.create(toActor(context), input);
    }),

  delete: base
    .input(z.object({ id: z.string().length(24) }))
    .use(authed)
    .use(requireRole("admin"))
    .handler(async ({ context, input }) => {
      return context.services.alert.delete(input.id);
    }),

  listEvents: base
    .input(z.object({ alertId: z.string().length(24) }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.alert.listEvents(input.alertId);
    }),
};

const inviteRouter = {
  accept: base
    .input(z.object({ token: z.string() }))
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.invite.accept({
        token: input.token,
        userId: context.user!.id,
      });
    }),
};

const statsRouter = {
  getQueueHistory: base
    .input(
      z.object({
        redisInstanceId: z.string().length(24),
        queueName: z.string().min(1),
        hours: z
          .number()
          .min(1 / 60)
          .max(24 * 30)
          .default(24),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.stats.getQueueHistory(toActor(context), input);
    }),

  getEnvironmentHistory: base
    .input(
      z.object({
        environmentId: z.string().length(24),
        hours: z
          .number()
          .min(1)
          .max(24 * 30)
          .default(24),
      }),
    )
    .use(authed)
    .handler(async ({ context, input }) => {
      return context.services.stats.getEnvironmentHistory(
        toActor(context),
        input,
      );
    }),
};

export const appRouter = {
  workspace: workspaceRouter,
  members: membersRouter,
  environment: environmentRouter,
  redis: redisRouter,
  queue: queueRouter,
  job: jobRouter,
  jobActions: jobActionsRouter,
  queueAdmin: queueAdminRouter,
  scheduler: schedulerRouter,
  bookmark: bookmarkRouter,
  alert: alertRouter,
  invite: inviteRouter,
  stats: statsRouter,
};

export type AppRouter = typeof appRouter;
