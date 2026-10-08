import { useForm } from "@tanstack/react-form";
import { useConfirm } from "@/components/confirm-provider";
import { useState } from "react";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";
import { rpcClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RevealableInput } from "@/components/ui/revealable-input";
import { Label } from "@unqueue/ui/components/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type RedisFormValues = {
  nickname: string;
  host: string;
  port: number;
  username: string;
  password: string;
  db: number;
  tls: boolean;
  tlsServername: string;
  bullmqPrefix: string;
};

export type RedisInstance = Awaited<ReturnType<typeof rpcClient.redis.list>>[number];

export const defaultFormValues: RedisFormValues = {
  nickname: "",
  host: "localhost",
  port: 6379,
  username: "",
  password: "",
  db: 0,
  tls: false,
  tlsServername: "",
  bullmqPrefix: "bull",
};

const redisFormSchema = z.object({
  nickname: z.string().trim().min(1, "Nickname is required").max(100),
  host: z.string().trim().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z.string(),
  db: z.number().int().min(0).max(15),
  tls: z.boolean(),
  tlsServername: z.string(),
  bullmqPrefix: z.string().trim().min(1, "Prefix is required"),
});

const STATUS_CHIP_CLASS: Record<string, string> = {
  connected:
    "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300",
  error:
    "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25",
  disconnected:
    "bg-amber-500/15 text-amber-800 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300",
};

function statusLabel(status: string) {
  if (status === "connected") return "Online";
  if (status === "error") return "Error";
  return "Offline";
}

function ConnectionStatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        STATUS_CHIP_CLASS[status] ??
          "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "connected" && "bg-emerald-500",
          status === "error" && "bg-destructive",
          status !== "connected" &&
            status !== "error" &&
            "bg-amber-500",
        )}
        aria-hidden
      />
      {statusLabel(status)}
    </span>
  );
}

function formatLastConnected(at: Date | string | null | undefined) {
  if (!at) return null;

  const date = new Date(at);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseRedisUrl(url: string): Partial<RedisFormValues> | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("redis://") && !trimmed.startsWith("rediss://")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const tls = parsed.protocol === "rediss:";

    return {
      host: parsed.hostname,
      port: parsed.port
        ? Number(parsed.port)
        : tls
          ? 6380
          : 6379,
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : "",
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : "",
      db: parsed.pathname && parsed.pathname.length > 1
        ? Number(parsed.pathname.slice(1))
        : 0,
      tls,
    };
  } catch {
    return null;
  }
}

export function instanceToFormValues(instance: RedisInstance): RedisFormValues {
  return {
    nickname: instance.nickname,
    host: instance.host ?? "",
    port: instance.port,
    username: instance.username ?? "",
    password: "",
    db: instance.db ?? 0,
    tls: instance.tls,
    tlsServername: instance.tlsServername ?? "",
    bullmqPrefix: instance.bullmqPrefix,
  };
}

function deleteConfirmPhrase(nickname: string) {
  return `delete ${nickname}`;
}

function RedisConnectionForm({
  environmentId,
  mode,
  editingId,
  instanceNickname,
  initialValues,
  canManage,
  onSuccess,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  environmentId: string;
  editingId?: string;
  instanceNickname?: string;
  initialValues: RedisFormValues;
  canManage: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(
    initialValues.tls ||
      initialValues.bullmqPrefix !== "bull" ||
      initialValues.db !== 0 ||
      !!initialValues.tlsServername,
  );
  const [connectionUrl, setConnectionUrl] = useState("");
  const confirm = useConfirm();

  const deletePhrase =
    instanceNickname != null ? deleteConfirmPhrase(instanceNickname) : "";
  const deleteConfirmed = deleteConfirm === deletePhrase;

  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      if (!environmentId || !canManage) return;

      const parsed = redisFormSchema.safeParse(value);
      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Invalid form values");
        return;
      }

      setFormError(null);

      const payload = {
        nickname: parsed.data.nickname,
        host: parsed.data.host,
        port: parsed.data.port,
        username: parsed.data.username || undefined,
        password: parsed.data.password || undefined,
        db: parsed.data.db,
        tls: parsed.data.tls,
        tlsServername: parsed.data.tlsServername || undefined,
        bullmqPrefix: parsed.data.bullmqPrefix,
      };

      if (mode !== "create" && editingId) {
        const ok = await confirm({
          title: "Save connection changes?",
          description: (
            <>
              <span className="font-medium">{payload.nickname}</span> will use the new
              settings for everyone in this environment right away.
            </>
          ),
          confirmLabel: "Save changes",
        });
        if (!ok) return;
      }

      try {
        if (mode === "create") {
          await rpcClient.redis.create({
            environmentId,
            ...payload,
          });
        } else if (editingId) {
          await rpcClient.redis.update({
            id: editingId,
            ...payload,
          });
        }

        onSuccess();
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : mode === "create"
              ? "Failed to add Redis instance"
              : "Failed to update Redis instance",
        );
      }
    },
  });

  const handleTestConnection = async () => {
    const values = form.state.values;
    const parsed = redisFormSchema.safeParse(values);

    if (!parsed.success) {
      setTestResult({
        ok: false,
        message: parsed.error.errors[0]?.message ?? "Fix form errors first",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setFormError(null);

    try {
      const result = await rpcClient.redis.testConnection({
        nickname: parsed.data.nickname || "test",
        host: parsed.data.host,
        port: parsed.data.port,
        username: parsed.data.username || undefined,
        password: parsed.data.password || undefined,
        db: parsed.data.db,
        tls: parsed.data.tls,
        tlsServername: parsed.data.tlsServername || undefined,
        bullmqPrefix: parsed.data.bullmqPrefix,
        environmentId,
        ...(mode === "edit" &&
          editingId &&
          !parsed.data.password && { id: editingId }),
      });

      setTestResult(
        result.ok
          ? { ok: true, message: "Connection successful" }
          : { ok: false, message: result.error },
      );
    } catch (error) {
      setTestResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "Connection test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const applyConnectionUrl = () => {
    const parsed = parseRedisUrl(connectionUrl);
    if (!parsed) {
      setFormError(
        "Could not parse URL. Use redis:// or rediss:// with host and optional credentials.",
      );
      return;
    }

    setFormError(null);
    if (parsed.host) form.setFieldValue("host", parsed.host);
    if (parsed.port) form.setFieldValue("port", parsed.port);
    if (parsed.password !== undefined) {
      form.setFieldValue("password", parsed.password);
    }
    if (parsed.username !== undefined) {
      form.setFieldValue("username", parsed.username);
    }
    if (parsed.db !== undefined && !Number.isNaN(parsed.db)) {
      form.setFieldValue("db", parsed.db);
      setAdvancedOpen(true);
    }
    if (parsed.tls !== undefined) {
      form.setFieldValue("tls", parsed.tls);
      if (parsed.tls) setAdvancedOpen(true);
    }
    setConnectionUrl("");
  };

  const handleDelete = async () => {
    if (!onDelete || !deleteConfirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onDelete();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to remove Redis instance",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {mode === "create" && (
          <div className="space-y-1.5">
            <Label htmlFor="connection-url">Connection URL</Label>
            <div className="flex gap-2">
              <Input
                id="connection-url"
                placeholder="redis://:password@host:6379"
                value={connectionUrl}
                onChange={(e) => setConnectionUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={applyConnectionUrl}
                disabled={!connectionUrl.trim()}
              >
                Apply
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a Redis URL to fill host, port, password, and TLS.
            </p>
          </div>
        )}

        <form.Field
          name="nickname"
          validators={{
            onChange: ({ value }) =>
              !value.trim() ? "Nickname is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                placeholder="Production Redis"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={!!field.state.meta.errors.length}
              />
              {field.state.meta.errors[0] && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <form.Field
            name="host"
            validators={{
              onChange: ({ value }) =>
                !value.trim() ? "Host is required" : undefined,
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="host">Host</Label>
                <RevealableInput
                  id="host"
                  placeholder="localhost"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="font-mono text-xs"
                  aria-invalid={!!field.state.meta.errors.length}
                />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">
                    {field.state.meta.errors[0]}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="port">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  min={1}
                  max={65535}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </form.Field>
        </div>

        <form.Field name="username">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="default (optional)"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="username"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Required for Redis ACL users on managed providers.
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={
                  mode === "edit" ? "Leave blank to keep current" : "Optional"
                }
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
        </form.Field>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
              Advanced options
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            <form.Field name="bullmqPrefix">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="bullmqPrefix">BullMQ key prefix</Label>
                  <Input
                    id="bullmqPrefix"
                    placeholder="bull"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must match the prefix configured in your BullMQ workers.
                  </p>
                </div>
              )}
            </form.Field>

            <form.Field name="db">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="db">Database index</Label>
                  <Input
                    id="db"
                    type="number"
                    min={0}
                    max={15}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    className="font-mono text-xs"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="tls">
              {(field) => (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 p-3">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-input"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm">Use TLS</span>
                    <span className="block text-xs text-muted-foreground">
                      Enable for managed Redis providers that require encrypted
                      connections.
                    </span>
                  </span>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.tls}>
              {(tls) =>
                tls ? (
                  <form.Field name="tlsServername">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor="tlsServername">TLS server name (SNI)</Label>
                        <Input
                          id="tlsServername"
                          placeholder="Leave blank to use host"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          Override when the certificate CN differs from the host.
                        </p>
                      </div>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
          </CollapsibleContent>
        </Collapsible>

        {testResult && (
          <p
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {testResult.message}
          </p>
        )}

        {formError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {formError}
          </p>
        )}

        {mode === "edit" && canManage && instanceNickname && onDelete && (
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-destructive">
                Delete connection
              </p>
              <p className="text-xs text-muted-foreground">
                This disconnects the instance and stops queue monitoring. Type{" "}
                <span className="font-mono text-foreground">{deletePhrase}</span>{" "}
                to confirm.
              </p>
            </div>
            <Input
              value={deleteConfirm}
              onChange={(e) => {
                setDeleteConfirm(e.target.value);
                setDeleteError(null);
              }}
              placeholder={deletePhrase}
              className="font-mono text-xs"
              autoComplete="off"
            />
            {deleteError && (
              <p className="text-xs text-destructive">{deleteError}</p>
            )}
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              loading={isDeleting}
              loadingText="Deleting..."
              disabled={!deleteConfirmed || form.state.isSubmitting}
              onClick={() => void handleDelete()}
            >
              <Trash2Icon />
              Delete connection
            </Button>
          </div>
        )}
      </div>

      <SheetFooter className="border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          loading={isTesting}
          loadingText="Testing..."
          disabled={form.state.isSubmitting || !canManage}
          onClick={() => void handleTestConnection()}
        >
          Test connection
        </Button>
        <Button
          type="submit"
          loading={form.state.isSubmitting}
          loadingText={mode === "create" ? "Adding..." : "Saving..."}
          disabled={isTesting || !canManage}
        >
          {mode === "create" ? "Add connection" : "Save changes"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function RedisConnectionSheet({
  open,
  onOpenChange,
  mode,
  environmentId,
  canManage,
  editingId,
  instanceNickname,
  initialValues = defaultFormValues,
  onSuccess,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  environmentId: string;
  canManage: boolean;
  editingId?: string;
  instanceNickname?: string;
  initialValues?: RedisFormValues;
  onSuccess: () => void;
  onDelete?: () => Promise<void>;
}) {
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {mode === "create" ? "Add Redis connection" : "Edit connection"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Connect a Redis instance used by your BullMQ workers."
              : "Update connection details. Leave password blank to keep the current value."}
          </SheetDescription>
        </SheetHeader>

        <RedisConnectionForm
          key={mode === "edit" && editingId ? editingId : "create"}
          mode={mode}
          environmentId={environmentId}
          editingId={editingId}
          instanceNickname={instanceNickname}
          initialValues={initialValues}
          canManage={canManage}
          onSuccess={onSuccess}
          onCancel={close}
          onDelete={onDelete}
        />
      </SheetContent>
    </Sheet>
  );
}
