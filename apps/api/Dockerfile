# Build from the monorepo root (Dokploy: context = repo root, Dockerfile = apps/api/Dockerfile).
# Runtime secrets come from compose / Dokploy env — not baked into the image.

# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Node 25+ no longer bundles corepack; install pnpm directly (keep in sync with packageManager).
RUN npm install -g pnpm@11.5.3
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npm install -g turbo@2.9.15
RUN turbo prune @unqueue/api --docker --out-dir=out

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ENV NODE_ENV=production
RUN pnpm exec turbo run build --filter=@unqueue/api \
  && pnpm --filter @unqueue/api deploy --prod /deploy

FROM node:26-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /deploy
COPY --from=builder --chown=node:node /deploy ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const port=process.env.PORT||3001;fetch('http://127.0.0.1:'+port+'/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
