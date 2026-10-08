import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDownIcon, PlusIcon, WandSparklesIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@unqueue/ui/components/label";
import { rpcClient } from "@/lib/api";
import { withToast } from "@/lib/notify";
import { useConfirm } from "@/components/confirm-provider";
import { cn } from "@/lib/utils";

export type AddJobPrefill = {
  name: string;
  data: unknown;
  attempts?: number;
  priority?: number;
  /** Job id this was cloned from; shown in the title. */
  sourceJobId?: string;
};

function stringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

function optionalInt(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function AddJobDialog({
  open,
  onOpenChange,
  redisInstanceId,
  queueName,
  prefill,
  knownJobNames = [],
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redisInstanceId: string;
  queueName: string;
  prefill?: AddJobPrefill;
  knownJobNames?: string[];
  onAdded?: (jobId: string) => void;
}) {
  const listId = useId();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [data, setData] = useState("{}");
  const [delaySeconds, setDelaySeconds] = useState("");
  const [priority, setPriority] = useState("");
  const [attempts, setAttempts] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(prefill?.name ?? "");
    setData(prefill ? stringify(prefill.data) : "{\n  \n}");
    setDelaySeconds("");
    setPriority(prefill?.priority ? String(prefill.priority) : "");
    setAttempts(prefill?.attempts ? String(prefill.attempts) : "");
    setShowAdvanced(!!(prefill?.priority || prefill?.attempts));
  }, [open, prefill]);

  const parsed = useMemo(() => parseJson(data), [data]);
  const nameError = !name.trim() ? "Job name is required" : undefined;
  const canSubmit = !nameError && parsed.ok && !submitting;
  const isReplay = !!prefill?.sourceJobId;

  const submit = async () => {
    if (!canSubmit || !parsed.ok) return;
    const delaySec = optionalInt(delaySeconds);
    const ok = await confirm({
      title: isReplay ? "Replay this job?" : "Add this job?",
      description: (
        <>
          {isReplay ? "Enqueues a new copy of" : "Enqueues"}{" "}
          <span className="font-mono">{name.trim()}</span>
          {isReplay && prefill?.sourceJobId ? (
            <>
              {" "}(from <span className="font-mono">#{prefill.sourceJobId}</span>)
            </>
          ) : null}{" "}
          on <span className="font-mono">{queueName}</span>. A worker will pick it up
          {delaySec ? ` after ${delaySec.toLocaleString()}s` : " right away"}.
        </>
      ),
      details: (
        <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(parsed.value, null, 2)}
        </pre>
      ),
      confirmLabel: isReplay ? "Replay job" : "Add job",
    });
    if (!ok) return;
    setSubmitting(true);
    const result = await withToast(
      () =>
        rpcClient.jobActions.add({
          redisInstanceId,
          queueName,
          name: name.trim(),
          data: parsed.value,
          delay: delaySec ? delaySec * 1000 : undefined,
          priority: optionalInt(priority),
          attempts: optionalInt(attempts) || undefined,
        }),
      {
        loading: isReplay ? "Replaying job…" : "Adding job…",
        success: (r) =>
          isReplay ? `Replayed as job #${r.jobId}` : `Added job #${r.jobId}`,
        error: "Could not add job",
      },
    );
    setSubmitting(false);
    if (result) {
      onOpenChange(false);
      onAdded?.(result.jobId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReplay ? (
              <>
                Edit &amp; replay job{" "}
                <span className="font-mono text-muted-foreground">#{prefill?.sourceJobId}</span>
              </>
            ) : (
              "Add a job"
            )}
          </DialogTitle>
          <DialogDescription>
            {isReplay
              ? "Tweak the payload, then enqueue it as a brand-new job. The original stays untouched."
              : (
                <>
                  Enqueue a job on <span className="font-mono">{queueName}</span>. Handy for testing a worker without writing a script.
                </>
              )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="add-job-name">Job name</Label>
            <Input
              id="add-job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="send-welcome-email"
              list={listId}
              autoFocus={!isReplay}
              className="font-mono text-xs"
              aria-invalid={!!name && !!nameError}
            />
            <datalist id={listId}>
              {knownJobNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="add-job-data">Payload (JSON)</Label>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={!parsed.ok}
                onClick={() => parsed.ok && setData(stringify(parsed.value))}
              >
                <WandSparklesIcon className="size-3" />
                Format
              </button>
            </div>
            <textarea
              id="add-job-data"
              value={data}
              onChange={(e) => setData(e.target.value)}
              spellCheck={false}
              autoFocus={isReplay}
              rows={10}
              className={cn(
                "w-full resize-y rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                !parsed.ok && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
              )}
              aria-invalid={!parsed.ok}
              aria-describedby="add-job-data-hint"
            />
            <p
              id="add-job-data-hint"
              className={cn(
                "text-[11px]",
                parsed.ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {parsed.ok ? "⌘↵ to submit" : parsed.error}
            </p>
          </div>

          <div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <ChevronDownIcon
                className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")}
              />
              Options
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="add-job-delay" className="text-xs">Delay (sec)</Label>
                  <Input
                    id="add-job-delay"
                    inputMode="numeric"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(e.target.value)}
                    placeholder="0"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-job-priority" className="text-xs">Priority</Label>
                  <Input
                    id="add-job-priority"
                    inputMode="numeric"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    placeholder="none"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-job-attempts" className="text-xs">Attempts</Label>
                  <Input
                    id="add-job-attempts"
                    inputMode="numeric"
                    value={attempts}
                    onChange={(e) => setAttempts(e.target.value)}
                    placeholder="1"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={submitting}>
              <PlusIcon />
              {isReplay ? "Replay job" : "Add job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
