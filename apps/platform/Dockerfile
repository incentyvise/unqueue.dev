# Build from the monorepo root (Dokploy: context = repo root, Dockerfile = apps/platform/Dockerfile).
# Secrets: Doppler (https://docs.doppler.com/docs/dockerfile).
#
# Dokploy — Build arguments:
#   DOPPLER_TOKEN       Read-only service token
#   DOPPLER_PROJECT     e.g. unqueue
#   DOPPLER_CONFIG      e.g. prd
#
# Local: `doppler run -- docker compose up --build` (passes token + secrets into build args).
# Runtime: nginx serves static files only. Vite inlines VITE_* at build; no Doppler in the container.

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
RUN turbo prune @unqueue/platform --docker --out-dir=out

FROM base AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl gnupg \
  && curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh \
  && apt-get purge -y gnupg \
  && rm -rf /var/lib/apt/lists/*

ENV DOPPLER_CONFIG_DIR=/tmp/.doppler

COPY --from=pruner /app/out/json/ .
# Root lockfile — turbo-pruned lockfiles can break pnpm --frozen-lockfile (missing snapshots).
COPY --from=pruner /app/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG DOPPLER_TOKEN
ARG DOPPLER_PROJECT=unqueue
ARG DOPPLER_CONFIG=prd
ARG VITE_API_URL
ENV DOPPLER_PROJECT=${DOPPLER_PROJECT}
ENV DOPPLER_CONFIG=${DOPPLER_CONFIG}
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_ENV=production

# Doppler when a service token is provided; otherwise rely on VITE_API_URL from compose/doppler run.
RUN mkdir -p /tmp/.doppler \
  && if [ -n "${DOPPLER_TOKEN}" ]; then \
    DOPPLER_TOKEN="${DOPPLER_TOKEN}" doppler run --config-dir /tmp/.doppler -- \
      pnpm exec turbo run build --filter=@unqueue/platform; \
  else \
    pnpm exec turbo run build --filter=@unqueue/platform; \
  fi

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/platform/dist /usr/share/nginx/html
COPY apps/platform/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
