import { useEffect, useState } from "react";
import {
  BellRingIcon,
  GitForkIcon,
  MoonIcon,
  RotateCcwIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTheme } from "@/components/theme-provider";
import { Brandmark } from "@/components/logo";
import { Button } from "@unqueue/ui/components/button";
import { cn } from "@/lib/utils";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const VALUE_PROPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: SearchIcon,
    title: "Find any job in seconds",
    body: "Search by ID, name, error or payload across every queue.",
  },
  {
    icon: RotateCcwIcon,
    title: "Fix and replay",
    body: "Errors grouped by cause. Edit a payload and re-run it in one click.",
  },
  {
    icon: BellRingIcon,
    title: "Know before your users do",
    body: "Live failure rates, backlog alerts, and a Discord ping when it matters.",
  },
];

const DEMO_QUEUES = [
  { name: "emails", base: 1240, rate: 3, tone: "bg-emerald-500" },
  { name: "billing.charge", base: 312, rate: 1, tone: "bg-emerald-500" },
  { name: "image-resize", base: 88, rate: 5, tone: "bg-blue-500" },
  { name: "webhooks.out", base: 41, rate: 2, tone: "bg-destructive" },
];

function LivePreview() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-white/70">production</span>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          Live
        </span>
      </div>
      <ul className="space-y-1">
        {DEMO_QUEUES.map((q) => (
          <li
            key={q.name}
            className="flex items-center gap-2.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px]"
          >
            <span className={cn("size-1.5 rounded-full", q.tone)} />
            <span className="flex-1 text-white/85">{q.name}</span>
            <span className="tabular-nums text-white/50">
              {(q.base + tick * q.rate).toLocaleString()} done
            </span>
            {q.tone === "bg-destructive" && (
              <span className="rounded bg-red-500/20 px-1 text-[10px] text-red-300">3 failed</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="relative grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-zinc-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,oklch(0.45_0.12_264/0.35),transparent_55%),radial-gradient(ellipse_at_90%_100%,oklch(0.5_0.14_160/0.2),transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.04)_1px,transparent_1px)] bg-size-[2.5rem_2.5rem] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />

        <Link to="/login" className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white text-zinc-950">
            <Brandmark size={20} />
          </span>
          <span className="text-base font-semibold tracking-tight">Unqueue</span>
        </Link>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
              Your BullMQ queues, finally out of the dark.
            </h2>
            <p className="text-sm text-white/60">
              A realtime dashboard for solo devs and small teams. Connect Redis, and
              every queue shows up in seconds — no SDK, no agents.
            </p>
          </div>
          <LivePreview />
          <ul className="space-y-4">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5">
                  <Icon className="size-3.5 text-white/80" />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-white/55">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-1.5 text-xs text-white/40">
          <GitForkIcon className="size-3.5" />
          Open source (AGPL-3.0) · self-host anytime
        </p>
      </aside>

      <main className="relative flex flex-col items-center justify-center p-4 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.92_0_0/0.5),transparent_55%)] lg:hidden dark:bg-[radial-gradient(ellipse_at_top,oklch(0.25_0.02_264/0.35),transparent_55%)]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </Button>

        <div className="relative z-10 w-full max-w-sm">
          <Link
            to="/login"
            className="mb-8 flex items-center gap-2.5 lg:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brandmark size={20} />
            </span>
            <span className="text-base font-semibold tracking-tight">Unqueue</span>
          </Link>

          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer ? (
            <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function AuthFormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

export function AuthFieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="text-xs text-destructive">{message}</p>;
}
