import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/confirm-provider";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { rpcClient } from "@/lib/api";
import { sessionQueryOptions } from "@/lib/session-query";
import { cn } from "@/lib/utils";
import { Badge } from "@unqueue/ui/components/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { JobStatusChip } from "@/components/job-status-chip";
import { CodeBlock } from "@/components/code-block";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDelay,
  formatDuration,
  formatJobTimestamp,
} from "@/lib/format-timestamp";
import { formatJobAttemptsValue } from "@/lib/format-job-attempts";
import type {
  JobBookmarkSnapshot,
  JobBookmarkTargetRef,
} from "@unqueue/shared";

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 py-px">
      <dt className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 text-[11px] leading-tight",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function noteWasEdited(createdAt: Date | string, updatedAt: Date | string) {
  return new Date(updatedAt).getTime() !== new Date(createdAt).getTime();
}

function authorLabel(name: string | null | undefined, email: string) {
  return name?.trim() || email;
}

function authorInitials(name: string | null | undefined, email: string) {
  const label = authorLabel(name, email);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function noteTimestamp(at: Date | string) {
  return formatJobTimestamp(new Date(at).getTime());
}

const noteTextareaClassName =
  "w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const noteSubmitHint =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘ Enter to save"
    : "Ctrl+Enter to save";

function handleNoteSubmitKeyDown(
  e: React.KeyboardEvent,
  onSubmit: () => void,
  isPending: boolean,
) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isPending) {
    e.preventDefault();
    onSubmit();
  }
}

function SnapshotContent({
  snapshot,
  queueName,
}: {
  snapshot: JobBookmarkSnapshot;
  queueName: string;
}) {
  const job = snapshot.job;
  const created = formatJobTimestamp(job.timestamp);
  const started = formatJobTimestamp(job.processedOn);
  const finished = formatJobTimestamp(job.finishedOn);
  const maxAttempts = job.opts?.attempts;

  return (
    <div className="space-y-5 text-xs">
      <p className="text-[11px] text-muted-foreground">
        Snapshot captured{" "}
        {noteTimestamp(snapshot.capturedAt).title ??
          noteTimestamp(snapshot.capturedAt).label}
      </p>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          Details
        </h3>
        <div className="grid grid-cols-2 gap-x-6">
          <dl className="min-w-0 space-y-0.5">
            <DetailRow label="Job ID" mono>
              {job.id}
            </DetailRow>
            <DetailRow label="Name">{job.name}</DetailRow>
            <DetailRow label="Queue" mono>
              {queueName}
            </DetailRow>
            <DetailRow label="Created" mono>
              <span title={created.title}>{created.label}</span>
            </DetailRow>
            <DetailRow label="Started" mono>
              <span title={started.title}>{started.label}</span>
            </DetailRow>
            <DetailRow label="Finished" mono>
              <span title={finished.title}>{finished.label}</span>
            </DetailRow>
            <DetailRow label="Duration" mono>
              {formatDuration(job.processedOn, job.finishedOn)}
            </DetailRow>
          </dl>
          <dl className="min-w-0 space-y-0.5">
            <DetailRow label="Status">
              <JobStatusChip state={job.state} />
            </DetailRow>
            <DetailRow label="Attempts" mono>
              {formatJobAttemptsValue(job.attemptsMade, maxAttempts)}
            </DetailRow>
            <DetailRow label="Priority" mono>
              {job.priority ?? job.opts?.priority ?? "—"}
            </DetailRow>
            <DetailRow label="Delay" mono>
              {formatDelay(job.delay ?? job.opts?.delay)}
            </DetailRow>
          </dl>
        </div>
      </section>

      {job.failedReason && (
        <>
          <Separator />
          <section>
            <h3 className="mb-2 font-medium text-destructive">Failed reason</h3>
            <CodeBlock code={job.failedReason} variant="destructive" />
          </section>
        </>
      )}

      {job.stacktrace && job.stacktrace.length > 0 && (
        <>
          <Separator />
          <section>
            <h3 className="mb-2 font-medium text-muted-foreground">
              Stack trace
            </h3>
            <CodeBlock
              code={job.stacktrace.join("\n")}
              lang="javascript"
              maxHeight="12rem"
            />
          </section>
        </>
      )}

      {job.returnValue != null && (
        <>
          <Separator />
          <section>
            <h3 className="mb-2 font-medium text-muted-foreground">
              Return value
            </h3>
            <CodeBlock value={job.returnValue} />
          </section>
        </>
      )}

      {job.opts && (
        <>
          <Separator />
          <section>
            <h3 className="mb-2 font-medium text-muted-foreground">Options</h3>
            <CodeBlock
              value={{
                attempts: job.opts.attempts,
                backoff: job.opts.backoff,
                priority: job.opts.priority,
                delay: job.opts.delay,
                removeOnComplete: job.opts.removeOnComplete,
                removeOnFail: job.opts.removeOnFail,
              }}
            />
          </section>
        </>
      )}

      <Separator />

      <section>
        <h3 className="mb-2 font-medium text-muted-foreground">Progress</h3>
        {snapshot.progress &&
        typeof snapshot.progress === "object" &&
        snapshot.progress !== null &&
        Object.keys(snapshot.progress).length > 0 ? (
          <div className="space-y-2">
            {"currentStep" in snapshot.progress && (
              <DetailRow label="Step">
                {String(
                  (snapshot.progress as { currentStep?: string }).currentStep,
                )}
              </DetailRow>
            )}
            {"percent" in snapshot.progress && (
              <DetailRow label="Percent">
                {(snapshot.progress as { percent?: number }).percent}%
              </DetailRow>
            )}
            {"steps" in snapshot.progress &&
              Array.isArray(
                (snapshot.progress as { steps?: unknown[] }).steps,
              ) &&
              (
                snapshot.progress as {
                  steps: Array<{ name: string; status: string }>;
                }
              ).steps.map((step) => (
                <div key={step.name} className="flex gap-2">
                  <Badge variant="outline">{step.status}</Badge>
                  <span>{step.name}</span>
                </div>
              ))}
            {!("currentStep" in snapshot.progress) &&
              !("percent" in snapshot.progress) &&
              !("steps" in snapshot.progress) && (
                <CodeBlock value={snapshot.progress} />
              )}
          </div>
        ) : (
          <p className="text-muted-foreground">No progress</p>
        )}
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 font-medium text-muted-foreground">Payload</h3>
        {snapshot.payload == null ? (
          <p className="text-muted-foreground">No payload</p>
        ) : (
          <CodeBlock value={snapshot.payload} />
        )}
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 font-medium text-muted-foreground">
          Logs {snapshot.logs.length > 0 && `(${snapshot.logs.length})`}
        </h3>
        {snapshot.logs.length === 0 ? (
          <p className="text-muted-foreground">No logs</p>
        ) : (
          <CodeBlock
            code={snapshot.logs
              .map((log) =>
                log.format === "json" && log.entry
                  ? `[${log.entry.level}] ${log.entry.message}`
                  : (log.raw ?? ""),
              )
              .join("\n")}
          />
        )}
      </section>
    </div>
  );
}

function NoteItem({
  note,
  canWrite,
  currentUserId,
  onUpdated,
}: {
  note: {
    id: string;
    userId: string;
    body: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    author: { id: string; name: string | null; email: string };
  };
  canWrite: boolean;
  currentUserId: string | undefined;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const isOwn = currentUserId === note.userId;
  const isPending = note.id.startsWith("optimistic-");
  const created = noteTimestamp(note.createdAt);
  const edited = noteWasEdited(note.createdAt, note.updatedAt);

  const editForm = useForm({
    defaultValues: { body: note.body },
    onSubmit: async ({ value }) => {
      const parsed = noteBodySchema.safeParse(value.body);
      if (!parsed.success) return;
      if (parsed.data === note.body) {
        setEditing(false);
        return;
      }
      const ok = await confirm({
        title: "Save changes to note?",
        description: "Everyone who can see this bookmark will see the edited note.",
        confirmLabel: "Save note",
      });
      if (!ok) return;
      await rpcClient.bookmark.updateNote({
        id: note.id,
        body: parsed.data,
      });
      setEditing(false);
      onUpdated();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => rpcClient.bookmark.deleteNote({ id: note.id }),
    onSuccess: onUpdated,
  });

  return (
    <div
      className={cn(
        "group flex gap-3 px-3 py-3",
        isPending && "opacity-60",
      )}
    >
      <Avatar size="sm" className="mt-0.5">
        <AvatarFallback>
          {authorInitials(note.author.name, note.author.email)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">
            {authorLabel(note.author.name, note.author.email)}
          </span>
          <span
            className="shrink-0 text-[10px] text-muted-foreground tabular-nums"
            title={created.title}
          >
            {isPending ? "Saving..." : created.label}
          </span>
          {edited && !isPending && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              edited
            </span>
          )}
          {canWrite && isOwn && !editing && !isPending && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="ml-auto shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                  aria-label="Note actions"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete note?",
                      description: "Your note will be removed for everyone. This cannot be undone.",
                      confirmLabel: "Delete note",
                      destructive: true,
                    });
                    if (ok) deleteMutation.mutate();
                  }}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void editForm.handleSubmit();
            }}
            className="mt-2 space-y-2"
          >
            <editForm.Field name="body">
              {(field) => (
                <textarea
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onKeyDown={(e) =>
                    handleNoteSubmitKeyDown(
                      e,
                      () => void editForm.handleSubmit(),
                      editForm.state.isSubmitting,
                    )
                  }
                  rows={3}
                  autoFocus
                  className={noteTextareaClassName}
                />
              )}
            </editForm.Field>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {noteSubmitHint}
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={editForm.state.isSubmitting}
                  loadingText="Saving..."
                >
                  Save
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
            {note.body}
          </p>
        )}
      </div>
    </div>
  );
}

type BookmarkDetail = Awaited<
  ReturnType<typeof rpcClient.bookmark.getBookmark>
>;
type BookmarkListItem = Awaited<
  ReturnType<typeof rpcClient.bookmark.listBookmarks>
>[number];

const noteBodySchema = z.string().trim().min(1).max(5000);

export function BookmarkSnapshotPanel({
  bookmarkId,
  workspaceId,
  canWrite,
  currentUserId,
}: {
  bookmarkId: string;
  workspaceId: string;
  canWrite: boolean;
  currentUserId: string | undefined;
}) {
  const queryClient = useQueryClient();

  const bookmarkQuery = useQuery({
    queryKey: ["bookmark", bookmarkId],
    queryFn: () => rpcClient.bookmark.getBookmark({ id: bookmarkId }),
  });

  const sessionQuery = useQuery(sessionQueryOptions());
  const sessionUser = sessionQuery.data?.data?.user;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["bookmark", bookmarkId] });
    void queryClient.invalidateQueries({
      queryKey: ["bookmarks", workspaceId],
    });
  };

  const addNoteMutation = useMutation({
    mutationFn: (body: string) =>
      rpcClient.bookmark.createNote({ bookmarkId, body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["bookmark", bookmarkId] });

      const previousBookmark = queryClient.getQueryData<BookmarkDetail>([
        "bookmark",
        bookmarkId,
      ]);
      const previousBookmarksLists = queryClient.getQueriesData<
        BookmarkListItem[]
      >({
        queryKey: ["bookmarks", workspaceId],
      });

      const now = new Date();
      const optimisticNote: BookmarkDetail["notes"][number] = {
        id: `optimistic-${now.getTime()}`,
        bookmarkId,
        userId: currentUserId ?? sessionUser?.id ?? "",
        body,
        createdAt: now,
        updatedAt: now,
        author: {
          id: currentUserId ?? sessionUser?.id ?? "",
          name: sessionUser?.name ?? "",
          email: sessionUser?.email ?? "",
        },
      };

      if (previousBookmark) {
        queryClient.setQueryData<BookmarkDetail>(["bookmark", bookmarkId], {
          ...previousBookmark,
          notes: [...previousBookmark.notes, optimisticNote],
        });
      }

      for (const [queryKey, data] of previousBookmarksLists) {
        if (!data) continue;
        queryClient.setQueryData<BookmarkListItem[]>(
          queryKey,
          data.map((bookmark) =>
            bookmark.id === bookmarkId
              ? { ...bookmark, noteCount: bookmark.noteCount + 1 }
              : bookmark,
          ),
        );
      }

      return { previousBookmark, previousBookmarksLists };
    },
    onError: (_error, body, context) => {
      if (context?.previousBookmark) {
        queryClient.setQueryData(
          ["bookmark", bookmarkId],
          context.previousBookmark,
        );
      }
      for (const [queryKey, data] of context?.previousBookmarksLists ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      addNoteForm.setFieldValue("body", body);
    },
    onSettled: () => {
      invalidate();
    },
  });

  const addNoteForm = useForm({
    defaultValues: { body: "" },
    onSubmit: ({ value }) => {
      const parsed = noteBodySchema.safeParse(value.body);
      if (!parsed.success) return;
      addNoteMutation.mutate(parsed.data);
      addNoteForm.reset();
    },
  });

  const bookmark = bookmarkQuery.data;
  const targetRef = bookmark?.targetRef as JobBookmarkTargetRef | undefined;
  const snapshot = bookmark?.snapshot as JobBookmarkSnapshot | undefined;

  return (
    <>
      <SheetHeader className="shrink-0 gap-3 border-b px-4 py-4 pr-12">
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetTitle>
              Job{" "}
              <span className="font-mono">
                {targetRef?.jobId ?? bookmarkId}
              </span>
            </SheetTitle>
            {bookmarkQuery.isLoading ? (
              <Skeleton className="h-3.5 w-48" />
            ) : (
              snapshot && (
                <SheetDescription className="truncate">
                  {snapshot.job.name}
                </SheetDescription>
              )
            )}
          </div>
          {targetRef && (
            <Button size="sm" variant="outline" asChild className="w-fit">
              <Link
                to="/$workspaceId/$environmentId/queues/$queueName"
                params={{
                  workspaceId,
                  environmentId: targetRef.environmentId,
                  queueName: targetRef.queueName,
                }}
                search={{
                  redisInstanceId: targetRef.redisInstanceId,
                  jobId: targetRef.jobId,
                }}
              >
                <ExternalLinkIcon />
                View live job
              </Link>
            </Button>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {bookmarkQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !snapshot || !targetRef ? (
          <p className="text-sm text-muted-foreground">Bookmark not found</p>
        ) : (
          <div className="space-y-5">
            <SnapshotContent
              snapshot={snapshot}
              queueName={targetRef.queueName}
            />

            <Separator />

            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-medium text-muted-foreground">
                  Notes
                  {(bookmark?.notes ?? []).length > 0 && (
                    <span className="ml-1.5 tabular-nums text-muted-foreground/70">
                      ({(bookmark?.notes ?? []).length})
                    </span>
                  )}
                </h3>
              </div>

              {canWrite && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addNoteForm.handleSubmit();
                  }}
                  className="mb-4 rounded-xl border bg-muted/20 p-3"
                >
                  <addNoteForm.Field name="body">
                    {(field) => (
                      <textarea
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onKeyDown={(e) =>
                          handleNoteSubmitKeyDown(
                            e,
                            () => void addNoteForm.handleSubmit(),
                            addNoteMutation.isPending,
                          )
                        }
                        placeholder="Leave a note about this job..."
                        rows={3}
                        className={noteTextareaClassName}
                      />
                    )}
                  </addNoteForm.Field>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {noteSubmitHint}
                    </span>
                    <Button
                      type="submit"
                      size="sm"
                      loading={addNoteMutation.isPending}
                      loadingText="Adding..."
                    >
                      Add note
                    </Button>
                  </div>
                </form>
              )}

              {(bookmark?.notes ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <MessageSquareIcon className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">No notes yet</p>
                    <p className="max-w-xs text-[11px] text-muted-foreground">
                      {canWrite
                        ? "Add context, findings, or follow-ups for this bookmarked job."
                        : "Notes from workspace members will appear here."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y rounded-xl border">
                  {(bookmark?.notes ?? []).map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      canWrite={canWrite}
                      currentUserId={currentUserId}
                      onUpdated={invalidate}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
