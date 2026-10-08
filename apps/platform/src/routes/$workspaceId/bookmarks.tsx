import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConfirm } from "@/components/confirm-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import {
  BookmarkIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { z } from "zod";
import { rpcClient } from "@/lib/api";
import { useShellContext } from "@/hooks/use-shell-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@unqueue/ui/components/label";
import { Badge } from "@unqueue/ui/components/badge";
import {
  Card,
  CardContent,
} from "@unqueue/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BookmarkSnapshotPanel } from "@/components/bookmark-snapshot-panel";
import { JobStatusChip } from "@/components/job-status-chip";
import { formatJobTimestamp } from "@/lib/format-timestamp";
import type { JobBookmarkSnapshot, JobBookmarkTargetRef } from "@unqueue/shared";
import { LucideCheckbox } from "@/components/lucide-checkbox";

const searchSchema = z.object({
  folderId: z.string().optional(),
  bookmarkId: z.string().optional(),
});

export const Route = createFileRoute("/$workspaceId/bookmarks")({
  validateSearch: searchSchema,
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["workspaces"],
        queryFn: () => rpcClient.workspace.list(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["bookmark-folders", params.workspaceId],
        queryFn: () => rpcClient.bookmark.listFolders({ workspaceId: params.workspaceId }),
      }),
    ]),
  component: BookmarksPage,
});

type Folder = Awaited<ReturnType<typeof rpcClient.bookmark.listFolders>>[number];
type BookmarkListItem = Awaited<
  ReturnType<typeof rpcClient.bookmark.listBookmarks>
>[number];

const folderNameSchema = z.string().trim().min(1, "Name is required").max(100);

function FolderFormSheet({
  open,
  onOpenChange,
  workspaceId,
  folder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  folder: Folder | null;
  onSaved: () => void;
}) {
  const isEdit = !!folder;
  const confirm = useConfirm();

  const form = useForm({
    defaultValues: {
      name: folder?.name ?? "",
      isShared: folder?.isShared ?? false,
    },
    onSubmit: async ({ value }) => {
      const parsed = z
        .object({
          name: folderNameSchema,
          isShared: z.boolean(),
        })
        .safeParse(value);
      if (!parsed.success) return;

      if (isEdit && folder) {
        const changes: string[] = [];
        if (parsed.data.name !== folder.name) {
          changes.push(`rename it to "${parsed.data.name}"`);
        }
        if (parsed.data.isShared !== folder.isShared) {
          changes.push(
            parsed.data.isShared
              ? "share it with everyone in the workspace"
              : "make it private to you",
          );
        }
        if (changes.length === 0) {
          onOpenChange(false);
          return;
        }
        const ok = await confirm({
          title: "Update folder?",
          description: <>This will {changes.join(" and ")}.</>,
          confirmLabel: "Update folder",
        });
        if (!ok) return;
        await rpcClient.bookmark.updateFolder({
          id: folder.id,
          name: parsed.data.name,
          isShared: parsed.data.isShared,
        });
      } else {
        await rpcClient.bookmark.createFolder({
          workspaceId,
          name: parsed.data.name,
          isShared: parsed.data.isShared,
        });
      }

      onSaved();
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: folder?.name ?? "",
        isShared: folder?.isShared ?? false,
      });
    }
  }, [open, folder, form]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit folder" : "New folder"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Rename this folder or change its sharing settings."
              : "Create a folder to organize bookmarked jobs."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="folder-name">Name</Label>
                <Input
                  id="folder-name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. Failed jobs"
                  autoFocus
                />
              </div>
            )}
          </form.Field>

          <form.Field name="isShared">
            {(field) => (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
                <LucideCheckbox
                  checked={field.state.value}
                  onCheckedChange={() => field.handleChange(!field.state.value)}
                  className="mt-0.5"
                  aria-label="Share with workspace"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Share with workspace</p>
                  <p className="text-xs text-muted-foreground">
                    All workspace members can view and add bookmarks to this
                    folder.
                  </p>
                </div>
              </label>
            )}
          </form.Field>

          <SheetFooter className="mt-auto px-0">
            <Button
              type="submit"
              loading={form.state.isSubmitting}
              loadingText={isEdit ? "Saving..." : "Creating..."}
            >
              {isEdit ? "Save changes" : "Create folder"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function BookmarksPage() {
  const { workspaceId } = Route.useParams();
  const { folderId: folderIdFromSearch, bookmarkId: bookmarkIdFromSearch } =
    Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [sheetBookmarkId, setSheetBookmarkId] = useState<string | undefined>(
    bookmarkIdFromSearch,
  );

  useEffect(() => {
    setSheetBookmarkId(bookmarkIdFromSearch);
  }, [bookmarkIdFromSearch]);

  const { currentUserId } = useShellContext();

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => rpcClient.workspace.list(),
  });

  const actorRole = workspacesQuery.data?.find((w) => w.id === workspaceId)?.role;
  const canWrite = actorRole !== undefined && actorRole !== "viewer";

  const foldersQuery = useQuery({
    queryKey: ["bookmark-folders", workspaceId],
    queryFn: () => rpcClient.bookmark.listFolders({ workspaceId }),
  });

  const folders = foldersQuery.data ?? [];
  const selectedFolderId =
    folderIdFromSearch && folders.some((f) => f.id === folderIdFromSearch)
      ? folderIdFromSearch
      : folders[0]?.id;

  useEffect(() => {
    if (
      folders.length > 0 &&
      folderIdFromSearch &&
      !folders.some((f) => f.id === folderIdFromSearch)
    ) {
      void navigate({
        to: "/$workspaceId/bookmarks",
        params: { workspaceId },
        search: { folderId: folders[0]!.id },
        replace: true,
      });
    }
  }, [folders, folderIdFromSearch, navigate, workspaceId]);

  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks", workspaceId, selectedFolderId],
    queryFn: () =>
      rpcClient.bookmark.listBookmarks({
        workspaceId,
        folderId: selectedFolderId!,
      }),
    enabled: !!selectedFolderId,
  });

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const isFolderCreator = selectedFolder?.createdBy === currentUserId;

  const filteredBookmarks = useMemo(() => {
    const items = bookmarksQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((bookmark) => {
      const targetRef = bookmark.targetRef as JobBookmarkTargetRef;
      const snapshot = bookmark.snapshot as JobBookmarkSnapshot;
      return (
        targetRef.jobId.toLowerCase().includes(q) ||
        snapshot.job.name.toLowerCase().includes(q) ||
        targetRef.queueName.toLowerCase().includes(q)
      );
    });
  }, [bookmarksQuery.data, search]);

  const invalidateFolders = () => {
    void queryClient.invalidateQueries({
      queryKey: ["bookmark-folders", workspaceId],
    });
  };

  const invalidateBookmarks = () => {
    void queryClient.invalidateQueries({ queryKey: ["bookmarks", workspaceId] });
  };

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => rpcClient.bookmark.deleteFolder({ id }),
    onSuccess: () => {
      invalidateFolders();
      invalidateBookmarks();
      void navigate({
        to: "/$workspaceId/bookmarks",
        params: { workspaceId },
        search: {},
        replace: true,
      });
    },
  });

  const deleteBookmarkMutation = useMutation({
    mutationFn: (id: string) => rpcClient.bookmark.deleteBookmark({ id }),
    onSuccess: () => {
      invalidateBookmarks();
      closeBookmarkSheet();
    },
  });

  const selectFolder = (folderId: string) => {
    void navigate({
      to: "/$workspaceId/bookmarks",
      params: { workspaceId },
      search: { folderId },
      replace: true,
    });
  };

  const openBookmarkSheet = (bookmarkId: string) => {
    setSheetBookmarkId(bookmarkId);
    void navigate({
      to: "/$workspaceId/bookmarks",
      params: { workspaceId },
      search: {
        folderId: selectedFolderId,
        bookmarkId,
      },
      replace: true,
    });
  };

  const closeBookmarkSheet = () => {
    setSheetBookmarkId(undefined);
    void navigate({
      to: "/$workspaceId/bookmarks",
      params: { workspaceId },
      search: selectedFolderId ? { folderId: selectedFolderId } : {},
      replace: true,
    });
  };

  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderSheetOpen(true);
  };

  const openEditFolder = (folder: Folder) => {
    setEditingFolder(folder);
    setFolderSheetOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-medium">Bookmarks</h1>
          <p className="text-xs text-muted-foreground">
            Saved job snapshots organized in folders.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreateFolder}>
            <PlusIcon />
            New folder
          </Button>
        )}
      </div>

      {foldersQuery.isLoading ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      ) : folders.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <BookmarkIcon className="size-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">No folders</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Create a folder to save job snapshots, then bookmark jobs
                    from the job detail sheet in any queue.
                  </p>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={openCreateFolder}>
                    <PlusIcon />
                    Create your first folder
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
            <Tabs
              value={selectedFolderId}
              onValueChange={selectFolder}
              className="min-w-0 flex-1"
            >
              <TabsList variant="line" className="h-auto w-fit justify-start">
                {folders.map((folder) => (
                  <TabsTrigger
                    key={folder.id}
                    value={folder.id}
                    className="flex-none gap-1.5"
                  >
                    {folder.name}
                    {folder.isShared && (
                      <Badge variant="outline" className="px-1 py-0 text-[9px]">
                        Shared
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {selectedFolder && isFolderCreator && canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="outline" aria-label="Folder actions">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEditFolder(selectedFolder)}>
                    Rename / sharing
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Delete folder?",
                        description: (
                          <>
                            <span className="font-medium">{selectedFolder.name}</span> and every
                            bookmark and note inside it will be deleted for everyone who can see
                            it. This cannot be undone.
                          </>
                        ),
                        confirmLabel: "Delete folder",
                        destructive: true,
                      });
                      if (ok) deleteFolderMutation.mutate(selectedFolder.id);
                    }}
                  >
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
            <div className="relative max-w-xs flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by job ID, name, or queue..."
                className="pl-8"
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredBookmarks.length} bookmark
              {filteredBookmarks.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {bookmarksQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "No bookmarks match your filter."
                    : "No bookmarks in this folder yet."}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b bg-background">
                  <tr className="text-left text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-2.5">Job</th>
                    <th className="px-4 py-2.5">Queue</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Bookmarked</th>
                    <th className="px-4 py-2.5">Notes</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredBookmarks.map((bookmark) => (
                    <BookmarkRow
                      key={bookmark.id}
                      bookmark={bookmark}
                      canWrite={canWrite}
                      onOpen={() => openBookmarkSheet(bookmark.id)}
                      onDelete={async () => {
                        const ok = await confirm({
                          title: "Delete bookmark?",
                          description: (
                            <>
                              The bookmark for job{" "}
                              <span className="font-mono">
                                #{(bookmark.targetRef as JobBookmarkTargetRef).jobId}
                              </span> and its saved
                              snapshot and notes will be deleted. The job itself in Redis is not
                              touched.
                            </>
                          ),
                          confirmLabel: "Delete bookmark",
                          destructive: true,
                        });
                        if (ok) deleteBookmarkMutation.mutate(bookmark.id);
                      }}
                      isDeleting={
                        deleteBookmarkMutation.isPending &&
                        deleteBookmarkMutation.variables === bookmark.id
                      }
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <FolderFormSheet
        open={folderSheetOpen}
        onOpenChange={setFolderSheetOpen}
        workspaceId={workspaceId}
        folder={editingFolder}
        onSaved={() => {
          invalidateFolders();
          invalidateBookmarks();
        }}
      />

      <Sheet
        open={!!sheetBookmarkId}
        onOpenChange={(open) => {
          if (!open) closeBookmarkSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-2xl"
          aria-describedby={undefined}
        >
          {sheetBookmarkId && (
            <BookmarkSnapshotPanel
              bookmarkId={sheetBookmarkId}
              workspaceId={workspaceId}
              canWrite={canWrite}
              currentUserId={currentUserId}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BookmarkRow({
  bookmark,
  canWrite,
  onOpen,
  onDelete,
  isDeleting,
}: {
  bookmark: BookmarkListItem;
  canWrite: boolean;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const targetRef = bookmark.targetRef as JobBookmarkTargetRef;
  const snapshot = bookmark.snapshot as JobBookmarkSnapshot;
  const bookmarked = formatJobTimestamp(
    new Date(bookmark.createdAt).getTime(),
  );

  return (
    <tr
      className={cn(
        "cursor-pointer border-b transition-colors hover:bg-muted/30",
        isDeleting && "opacity-50",
      )}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{snapshot.job.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {targetRef.jobId}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 font-mono">{targetRef.queueName}</td>
      <td className="px-4 py-3">
        <JobStatusChip state={snapshot.job.state} />
      </td>
      <td className="px-4 py-3 font-mono tabular-nums">
        <span title={bookmarked.title}>{bookmarked.label}</span>
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {bookmark.noteCount}
      </td>
      <td className="px-4 py-3">
        {canWrite && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Remove bookmark"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2Icon className="size-3" />
          </Button>
        )}
      </td>
    </tr>
  );
}
