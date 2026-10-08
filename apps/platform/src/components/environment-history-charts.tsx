import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type EnvironmentHistoryPoint = {
  t: number;
  throughput: number;
  failedPerMin: number;
  completedPerMin: number;
  failureRate: number;
  backlog: number;
  active: number;
  p95RuntimeMs: number;
};

const TICK = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
  fontFamily: "var(--font-mono, monospace)",
};

function fmtTime(t: number, rangeMs: number) {
  const d = new Date(t);
  if (rangeMs > 36 * 3_600_000) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtTooltipTime(t: number) {
  return new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.1) return n.toFixed(2);
  if (Math.abs(n) < 10) return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number) {
  const pct = n * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function ChartTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: number;
  rows: Array<{ key: string; label: string; color: string; format: (v: number) => string }>;
}) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-[11px] shadow-md">
      <p className="mb-1 font-medium">{fmtTooltipTime(label)}</p>
      {rows.map((row) => {
        const entry = payload.find((p) => p.dataKey === row.key);
        if (!entry || entry.value == null) return null;
        return (
          <p key={row.key} className="flex items-center gap-1.5 tabular-nums">
            <span className="size-2 rounded-full" style={{ background: row.color }} />
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto pl-3 font-mono">{row.format(entry.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

// Literal colours: Tailwind only emits theme variables that are referenced by classes.
const EMERALD = "oklch(0.696 0.17 162.48)";
const RED = "var(--color-destructive)";
const SKY = "oklch(0.685 0.169 237.323)";
const AMBER = "oklch(0.769 0.188 70.08)";

function ChartCard({
  title,
  value,
  sub,
  children,
  className,
}: {
  title: string;
  value?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {value && (
          <p className="text-right">
            <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
            {sub && <span className="ml-1 text-[11px] text-muted-foreground">{sub}</span>}
          </p>
        )}
      </div>
      <div className="h-40">{children}</div>
    </div>
  );
}

export function EnvironmentHistoryCharts({
  points,
  rangeHours,
  isLoading,
}: {
  points: EnvironmentHistoryPoint[];
  rangeHours: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[13.5rem] rounded-xl" />
        ))}
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-10 text-center">
        <p className="text-sm font-medium">Not enough history yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Unqueue snapshots every queue once a minute. Charts fill in after a couple of minutes of activity.
        </p>
      </div>
    );
  }

  const rangeMs = rangeHours * 3_600_000;
  const peakThroughput = Math.max(...points.map((p) => p.throughput));
  const avgFailure =
    points.reduce((s, p) => s + p.failedPerMin, 0) /
    Math.max(
      1e-9,
      points.reduce((s, p) => s + p.failedPerMin + p.completedPerMin, 0),
    );
  const latestBacklog = points[points.length - 1]?.backlog ?? 0;

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      tickFormatter={(t: number) => fmtTime(t, rangeMs)}
      tick={TICK}
      tickLine={false}
      axisLine={false}
      minTickGap={40}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChartCard title="Jobs finished per minute" value={fmtNum(peakThroughput)} sub="peak">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            {grid}
            {xAxis}
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={fmtNum} />
            <Tooltip
              content={
                <ChartTooltip
                  rows={[
                    { key: "completedPerMin", label: "Completed", color: EMERALD, format: fmtNum },
                    { key: "failedPerMin", label: "Failed", color: RED, format: fmtNum },
                  ]}
                />
              }
            />
            <Area type="monotone" dataKey="completedPerMin" stackId="1" stroke={EMERALD} fill={EMERALD} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="failedPerMin" stackId="1" stroke={RED} fill={RED} fillOpacity={0.3} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Failure rate" value={fmtPct(avgFailure)} sub="avg">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            {grid}
            {xAxis}
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={fmtPct} />
            <Tooltip
              content={
                <ChartTooltip
                  rows={[{ key: "failureRate", label: "Failure rate", color: RED, format: fmtPct }]}
                />
              }
            />
            <Area type="monotone" dataKey="failureRate" stroke={RED} fill={RED} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Backlog & active" value={fmtNum(latestBacklog)} sub="waiting now">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            {grid}
            {xAxis}
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={fmtNum} />
            <Tooltip
              content={
                <ChartTooltip
                  rows={[
                    { key: "backlog", label: "Backlog", color: AMBER, format: fmtNum },
                    { key: "active", label: "Active", color: SKY, format: fmtNum },
                  ]}
                />
              }
            />
            <Area type="monotone" dataKey="backlog" stroke={AMBER} fill={AMBER} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="active" stroke={SKY} fill={SKY} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
