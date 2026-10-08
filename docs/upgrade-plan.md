# Platform Upgrade Plan (Oct 2026)

## Who Unqueue is for

Solo developers and small teams running BullMQ in production who need to answer
three questions fast, without setting up Grafana or paying for an enterprise tool:

1. **Is anything broken right now?** (failures, stuck backlog, paused queues, Redis down)
2. **Why did this job fail?** (find the job, read the error/payload/logs)
3. **How do I fix it?** (retry, replay with edited data, clean up, enqueue a test job)

Everything below is prioritised by how much it shortens those three loops for
one person on call for their own app. Enterprise features (SSO, audit logs,
OTel ingestion, Prometheus) are deliberately out of scope for this pass.

## Research summary

- Competitors (Workbench, bullstudio, Arena, bull-board) all offer **job search by
  ID/name/data**, payload filtering and **manual job add/replay**. Unqueue had replay
  but no search and no way to add or edit a job — the biggest functional gap.
- Workbench leads on **keyboard-first UX** (`⌘K`, single-key actions) and **error
  triage grouped by error class** (we grouped only by job name).
- Dev-tool UX norms: toasts for every mutation (we had none — actions were silent),
  empty states with exactly one next action, first-run checklist to reach the
  "aha" moment (see a live queue), and command palettes that run actions, not
  just navigate.

## Prioritised plan

### P0 — core loops (ship first)

| # | Feature | Page | Why |
|---|---------|------|-----|
| 1 | Global toast feedback (sonner) for every job/queue action, incl. bulk result counts | all | Actions were silent; users couldn't tell if retry worked |
| 2 | Job search: by exact job ID, name, and payload text, server-side over the selected state | queue/:id | #1 competitor feature; fixes "find the job" loop |
| 3 | Add job dialog (name, JSON data, delay, priority, attempts) | queue/:id | Test workers without writing a script |
| 4 | Edit & replay: clone a job's payload into the add dialog | job panel | Fix bad data and re-run (roadmap P3, very high value for solo devs) |
| 5 | Error grouping by job name **and** normalised error message | queue/:id | Distinguishes "timeout" from "validation" failures in the same job type |
| 6 | Confirmations for bulk remove; inline loading states on bulk actions | queue/:id | Safety on destructive actions |
| 7 | Forgot / reset password pages (server already supports it) | login | Users locked out had no recovery path |

### P1 — at-a-glance health

| # | Feature | Page |
|---|---------|------|
| 8 | New **Queues** page: searchable, filterable (all/failing/backlog/paused/active), sortable table with health dot, failure %, workers, quick links | queues |
| 9 | Overview health hero ("All systems healthy" / "3 queues need attention"), 4 focused KPIs instead of 8 redundant cards, live throughput | overview |
| 10 | First-run onboarding checklist (connect Redis → queue discovered → invite teammate) | overview |
| 11 | Stats: environment-level throughput & failure charts from snapshots, time-range selector, sortable queue table, top-failing leaderboard, CSV export | stats |
| 12 | Redesigned auth: split layout with product value props, password strength meter, caps-lock hint, remember last email, terms/self-host note | login, signup |

### P2 — speed for power users

| # | Feature | Page |
|---|---------|------|
| 13 | Keyboard shortcuts: `/` search, `j/k` move, `enter` open, `x` select, `r` retry, `e` replay, `#`/`del` remove, `g o / g q / g s` navigation, `?` help dialog | queue/:id, global |
| 14 | Command palette actions: pause/resume current queue, toggle theme, go to stats/queues | global |
| 15 | Job panel: copy payload/ID/link buttons, structured log levels with colours, relative + absolute timestamps | job panel |
| 16 | Queue header: overflow menu for destructive actions (drain/clean/obliterate) so primary actions breathe; copy queue link | queue/:id |

### Deferred (documented, not in this pass)

- FlowProducer DAG view, Prometheus endpoint, OTel, Slack/email alerts, worker
  host metrics — larger backend work, tracked in `ROADMAP.md`.

## Implementation notes

- Backend additions: `job.search`, `jobActions.add`, error-message fingerprinting in
  `listFailedJobGroups`, `stats.getEnvironmentHistory`.
- All new RPCs reuse existing RBAC helpers (`viewer` for reads, `member` for writes).
- No new DB migrations needed; environment history aggregates existing
  `queue_metric_snapshots`.
