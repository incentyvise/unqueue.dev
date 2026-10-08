# Unqueue

Realtime operational dashboard for BullMQ. AGPL-3.0 licensed.

## Features

- Queue observability with auto-discovery, health filters, pinning, and sorting
- Job search by ID, name, failure reason, or payload text
- Failures grouped by job name + normalised error, with retry/remove per group
- Add jobs manually, or edit a job's payload and replay it
- Live job inspection, structured logs (filterable by level), and progress
- Socket.IO realtime updates
- In-memory rolling-window metrics plus 30-day environment history charts and CSV export
- Job and queue admin actions with toast feedback and confirmations
- Keyboard-first: `⌘K` palette, `/` search, `j`/`k` navigation, `?` for all shortcuts
- Workspace RBAC with email/password auth, password reset
- Bookmarks and Discord alerts

## Requirements

- Node.js 24+
- pnpm 11+
- [Doppler CLI](https://docs.doppler.com/docs/install-cli)
- PostgreSQL 18+ (`DATABASE_URL`)
- Redis (`REDIS_URL`, optional; separate from your BullMQ Redis instances)

## Secrets (Doppler)

This repo uses Doppler for all secrets. There is no local `.env` workflow.

1. Install the Doppler CLI and log in:

```bash
brew install dopplerhq/cli/doppler   # macOS
doppler login
```

2. Link the repo (creates project `unqueue` / config `dev` if needed):

```bash
pnpm doppler:setup
```

3. Add secrets using `.env.example` as a key reference:

```bash
pnpm doppler:secrets
```

Generate an encryption key:

```bash
node -e "console.log(JSON.stringify([{keyId:1,key:require('crypto').randomBytes(32).toString('base64')}]))"
```

Set it in Doppler:

```bash
doppler secrets set ENCRYPTION_KEYS='[{"keyId":1,"key":"..."}]'
doppler secrets set BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
```

For local dev, leave `VITE_API_URL` empty — the platform calls `http://localhost:3001` directly. In production, set `VITE_API_URL` to the public API origin (e.g. `https://unqueueserver.parthk.dev`) and `COOKIE_DOMAIN` to your parent domain (e.g. `.parthk.dev`) so auth cookies work across platform and API subdomains.

## Quick start (development)

1. Set `DATABASE_URL` and `REDIS_URL` in Doppler (see `.env.example`).

2. Install dependencies and migrate:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
```

3. Start dev servers:

```bash
pnpm dev
```

- Platform: http://localhost:5174
- API: http://localhost:3001

4. (Optional) Run the demo BullMQ worker:

```bash
pnpm demo-worker
```

Then add your BullMQ Redis instance in Settings.

## Connecting your Redis

Unqueue connects to **your** Redis instances (separate from the app's own `REDIS_URL`). Each registered instance uses **two persistent connections**: one for queue reads and admin actions, and one for BullMQ `QueueEvents` realtime subscriptions.

### Recommended setup

1. Create a **dedicated ACL user** per environment — do not share the `default` superuser.
2. Use **TLS** (`rediss://`) for managed providers (Redis Cloud, Upstash, ElastiCache, Azure Cache).
3. If your provider requires ACL auth, set **username** and password in the connection form.
4. Match the **BullMQ key prefix** to what your workers use (default: `bull`).

### ACL permissions

**Monitoring only** (view queues, jobs, metrics, bookmarks):

- `@read` on BullMQ keys, or at minimum: `SCAN`, `GET`, `HGET`, `HGETALL`, `LRANGE`, `ZRANGE`, `ZCARD`, `LLEN`, `TYPE`, `PING`, `INFO`, `SUBSCRIBE` / `PSUBSCRIBE` (for events)

**Admin actions** (retry/remove jobs, pause/drain/clean/obliterate queues):

- Above plus write commands BullMQ uses: `DEL`, `HDEL`, `HSET`, `LPUSH`, `RPUSH`, `ZADD`, `ZREM`, `LREM`, `EVAL` / `EVALSHA`, `MULTI`, `EXEC`, etc.

Example Redis 7 ACL (adjust key patterns to your prefix):

```
ACL SETUSER unqueue-read on >your-password ~bull:* &* +@read +ping +info +psubscribe +subscribe
ACL SETUSER unqueue-admin on >your-password ~bull:* &* +@read +@write +@pubsub +ping +info
```

### Connection URL format

```
rediss://username:password@host:6380/0
```

Paste a URL in the connection form to pre-fill host, port, username, password, DB index, and TLS.

## Docker / Dokploy

Two compose files:

| File                       | Services                   |
| -------------------------- | -------------------------- |
| `docker-compose.infra.yml` | Postgres, PgBouncer, Redis |
| `docker-compose.yml`       | Server, Platform           |

Deploy infra and app as separate Dokploy compose stacks (or environments). Point `DATABASE_URL` at PgBouncer (`pgbouncer:5432` in-network, port `6432` externally) and `REDIS_URL` at `redis://:REDIS_PASSWORD@redis:6379`.

**Infra stack:** set env vars from `.env.infra.example` in Dokploy compose environment.

**App stack:** secrets in Doppler; run with `doppler run -- docker compose up` (see `pnpm compose:up`). Connection URLs (`DATABASE_URL`, `REDIS_URL`): `.env.example`.

App stack (local):

```bash
pnpm compose:up:build
```

## Architecture

- `apps/platform` - React SPA (Vite, TanStack Router/Query/Table/Virtual)
- `apps/server` - Hono API, oRPC, Socket.IO, BullMQ integration
- `packages/*` - Shared libraries

## Testing

```bash
pnpm test
```

Unit tests do not require Doppler. Commands that touch the database (`db:migrate`, `dev`, `build`) run through `doppler run`.

## License

AGPL-3.0 - see [LICENSE](LICENSE). Hosted official instance: https://app.unqueue.dev
