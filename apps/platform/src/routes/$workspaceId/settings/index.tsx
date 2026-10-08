import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/confirm-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { rpcClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$workspaceId/settings/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["workspaces"],
      queryFn: () => rpcClient.workspace.list(),
    }),
  component: WorkspaceSettings,
});

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[3rem] items-center gap-6 py-3", className)}>
      <span className="w-36 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{value}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? (
          <CheckIcon className="size-3 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function WorkspaceSettings() {
  const { workspaceId } = Route.useParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => rpcClient.workspace.list(),
  });

  const workspace = workspaces?.find((w) => w.id === workspaceId);
  const canEdit = workspace?.role === "owner" || workspace?.role === "admin";

  const [nameValue, setNameValue] = useState(workspace?.name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (workspace?.name) setNameValue(workspace.name);
  }, [workspace?.name]);

  const isDirty = nameValue.trim() !== (workspace?.name ?? "");

  const save = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || !isDirty) return;
    const ok = await confirm({
      title: "Rename workspace?",
      description: (
        <>
          <span className="font-medium">{workspace?.name}</span> will be renamed to{" "}
          <span className="font-medium">{trimmed}</span> for every member.
        </>
      ),
      confirmLabel: "Rename",
    });
    if (!ok) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await rpcClient.workspace.rename({ workspaceId, name: trimmed });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const createdAt = workspace?.createdAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(workspace.createdAt),
      )
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-lg">
        {isLoading ? (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-3">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {/* Name */}
            <div className="px-5">
              <Row label="Name">
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void save();
                        if (e.key === "Escape")
                          setNameValue(workspace?.name ?? "");
                      }}
                      disabled={isSaving}
                      className="h-7 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      maxLength={64}
                    />

                    <Button
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      disabled={isSaving || !isDirty}
                      loading={isSaving}
                      loadingText="Saving..."
                      onClick={() => void save()}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm">{workspace?.name}</span>
                )}
              </Row>
              {saveError && (
                <p className="pb-2 text-xs text-destructive">{saveError}</p>
              )}
            </div>

            {/* Workspace ID */}
            <div className="px-5">
              <Row label="Workspace ID">
                <CopyValue value={workspaceId} />
              </Row>
            </div>

            {/* Role */}
            <div className="px-5">
              <Row label="Your role">
                <span className="text-sm capitalize">
                  {workspace?.role ?? "—"}
                </span>
              </Row>
            </div>

            {/* Created */}
            <div className="px-5">
              <Row label="Created">
                <span className="text-sm text-muted-foreground">
                  {createdAt ?? "—"}
                </span>
              </Row>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
