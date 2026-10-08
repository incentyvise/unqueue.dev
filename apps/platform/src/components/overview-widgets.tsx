import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BellIcon,
  CheckCircle2Icon,
  CheckIcon,
  DatabaseZapIcon,
  LayersIcon,
  UsersIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── health hero ──────────────────────────────────────────────────────────────

export type HealthSummary = {
  offlineConnections: number;
  totalConnections: number;
  failingQueues: number;
  pausedQueues: number;
  backlogQueues: number;
  queueCount: number;
  throughputPerMin: number | null;
};

export function HealthHero({
  summary,
  workspaceId,
  environmentId,
}: {
  summary: HealthSummary;
  workspaceId: string;
  environmentId: string;
}) {
  const issues: string[] = [];
  if (summary.failingQueues > 0) {
    issues.push(`${summary.failingQueues} failing`);
  }
  if (summary.backlogQueues > 0) {
    issues.push(`${summary.backlogQueues} backed up`);
  }
  if (summary.pausedQueues > 0) {
    issues.push(`${summary.pausedQueues} paused`);
  }

  const tone =
    summary.offlineConnections > 0
      ? "critical"
      : summary.failingQueues > 0
        ? "warning"
        : issues.length > 0
          ? "notice"
          : "healthy";

  const config = {
    critical: {
      icon: WifiOffIcon,
      title:
        summary.offlineConnections === summary.totalConnections
          ? "Redis is unreachable"
          : `${summary.offlineConnections} of ${summary.totalConnections} connections offline`,
      body: "Queue data may be stale until the connection recovers. Check credentials, TLS, and network access.",
      className: "border-destructive/30 bg-destructive/5",
      iconClass: "bg-destructive/15 text-destructive",
    },
    warning: {
      icon: AlertTriangleIcon,
      title: `${summary.failingQueues} ${summary.failingQueues === 1 ? "queue has" : "queues have"} failing jobs`,
      body: issues.length > 1 ? `Also: ${issues.slice(1).join(", ")}.` : "Open the queue's Errors tab to see failures grouped by cause.",
      className: "border-amber-500/30 bg-amber-500/5",
      iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    notice: {
      icon: AlertTriangleIcon,
      title: `${issues.join(", ")}`.replace(/^./, (c) => c.toUpperCase()),
      body: "No failures, but some queues need a look.",
      className: "border-sky-500/30 bg-sky-500/5",
      iconClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    },
    healthy: {
      icon: CheckCircle2Icon,
      title: "All systems healthy",
      body:
        summary.queueCount === 0
          ? "Connected and waiting for your first queue."
          : `${summary.queueCount} ${summary.queueCount === 1 ? "queue" : "queues"} running with no failures${
              summary.throughputPerMin != null && summary.throughputPerMin > 0
                ? ` · ${summary.throughputPerMin.toFixed(1)} jobs/min`
                : ""
            }.`,
      className: "border-emerald-500/30 bg-emerald-500/5",
      iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
  }[tone];

  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3.5",
        config.className,
      )}
      role="status"
    >
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", config.iconClass)}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{config.title}</p>
        <p className="text-xs text-muted-foreground">{config.body}</p>
      </div>
      {tone === "critical" ? (
        <Button size="sm" variant="outline" asChild>
          <Link to="/$workspaceId/connections" params={{ workspaceId }}>
            Check connections
          </Link>
        </Button>
      ) : tone !== "healthy" ? (
        <Button size="sm" variant="outline" asChild>
          <Link
            to="/$workspaceId/$environmentId/queues"
            params={{ workspaceId, environmentId }}
            search={{ filter: tone === "warning" ? "failed" : summary.backlogQueues > 0 ? "backlog" : "paused" }}
          >
            Review queues
            <ArrowRightIcon />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  series,
  tone = "default",
  isLoading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  series?: number[];
  tone?: "default" | "destructive" | "warning" | "success" | "blue";
  isLoading?: boolean;
}) {
  const toneText = {
    default: "",
    destructive: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
  }[tone];
  const sparkTone = {
    default: "text-primary/70",
    destructive: "text-destructive",
    warning: "text-amber-500",
    success: "text-emerald-500",
    blue: "text-blue-500",
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-3.5 text-muted-foreground/70" />
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", toneText)}>
          {value}
        </p>
      )}
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{hint}</p>
        {series && (
          <Sparkline values={series} className={cn("shrink-0", sparkTone)} width={88} height={26} />
        )}
      </div>
    </div>
  );
}

// ─── onboarding checklist ─────────────────────────────────────────────────────

const DISMISS_KEY = "unqueue-onboarding-dismissed";

function readDismissed(workspaceId: string) {
  try {
    return localStorage.getItem(`${DISMISS_KEY}:${workspaceId}`) === "1";
  } catch {
    return false;
  }
}

export function OnboardingChecklist({
  workspaceId,
  hasConnection,
  hasQueue,
  hasAlert,
  hasTeammate,
  canManage,
  onAddConnection,
}: {
  workspaceId: string;
  hasConnection: boolean;
  hasQueue: boolean;
  hasAlert: boolean;
  hasTeammate: boolean;
  canManage: boolean;
  onAddConnection: () => void;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(workspaceId));

  const steps: Array<{
    done: boolean;
    title: string;
    description: string;
    icon: LucideIcon;
    action?: React.ReactNode;
  }> = [
    {
      done: hasConnection,
      title: "Connect your Redis",
      description: "Point Unqueue at the Redis your BullMQ workers already use.",
      icon: DatabaseZapIcon,
      action: canManage ? (
        <Button size="sm" onClick={onAddConnection}>
          Add connection
        </Button>
      ) : undefined,
    },
    {
      done: hasQueue,
      title: "See your first queue",
      description: "Queues show up automatically once a producer or worker touches Redis.",
      icon: LayersIcon,
      action: (
        <Button size="sm" variant="outline" asChild>
          <a href="https://unqueue.dev/docs/connecting-redis" target="_blank" rel="noreferrer">
            Troubleshoot
          </a>
        </Button>
      ),
    },
    {
      done: hasAlert,
      title: "Get alerted on failures",
      description: "Send a Discord message when failure rate spikes or jobs back up.",
      icon: BellIcon,
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/$workspaceId/settings/alerts" params={{ workspaceId }}>
            Create alert
          </Link>
        </Button>
      ),
    },
    {
      done: hasTeammate,
      title: "Invite a teammate",
      description: "Optional — share on-call with someone else. Viewers are read-only.",
      icon: UsersIcon,
      action: canManage ? (
        <Button size="sm" variant="outline" asChild>
          <Link to="/$workspaceId/settings/members" params={{ workspaceId }}>
            Invite
          </Link>
        </Button>
      ) : undefined,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Get set up</p>
          <p className="text-xs text-muted-foreground">
            {doneCount} of {steps.length} done · takes about two minutes
          </p>
        </div>
        <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        {hasConnection && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            try {
              localStorage.setItem(`${DISMISS_KEY}:${workspaceId}`, "1");
            } catch {
              // ignore
            }
            setDismissed(true);
          }}
          aria-label="Dismiss setup checklist"
          title="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
        )}
      </div>
      <ol className="divide-y">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isNext = index === nextIndex;
          return (
            <li
              key={step.title}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                isNext && "bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {step.done ? <CheckIcon className="size-3.5" /> : <Icon className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-medium",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-[11px] text-muted-foreground">{step.description}</p>
                )}
              </div>
              {!step.done && isNext && step.action}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
