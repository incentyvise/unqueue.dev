import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/confirm-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import {
  CopyIcon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { z } from "zod";
import { rpcClient } from "@/lib/api";
import { useShellContext } from "@/hooks/use-shell-context";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@unqueue/ui/components/label";
import { Badge } from "@unqueue/ui/components/badge";
import {
  Card,
  CardContent,
} from "@unqueue/ui/components/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/$workspaceId/settings/members")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["workspaces"],
        queryFn: () => rpcClient.workspace.list(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["members", params.workspaceId],
        queryFn: () => rpcClient.members.list({ workspaceId: params.workspaceId }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["member-invites", params.workspaceId],
        queryFn: () => rpcClient.members.listInvites({ workspaceId: params.workspaceId }),
      }),
    ]),
  component: MembersSettings,
});

type Member = Awaited<ReturnType<typeof rpcClient.members.list>>[number];
type Invite = Awaited<ReturnType<typeof rpcClient.members.listInvites>>[number];
const ROLE_VALUES = ["owner", "admin", "member", "viewer"] as const;
type Role = (typeof ROLE_VALUES)[number];

const ROLES: Role[] = [...ROLE_VALUES];

type SheetMode = "invite" | "edit-member" | "edit-invite";

const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const satisfies readonly Role[];

const ROLE_META: Record<
  Role,
  { label: string; description: string; badgeVariant: "default" | "secondary" | "outline" | "warning" }
> = {
  owner: {
    label: "Owner",
    description: "Full workspace access, including billing and all settings.",
    badgeVariant: "default",
  },
  admin: {
    label: "Admin",
    description: "Manage connections, alerts, and team members.",
    badgeVariant: "default",
  },
  member: {
    label: "Member",
    description: "View queues, inspect jobs, and run queue actions.",
    badgeVariant: "secondary",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to queues and job data.",
    badgeVariant: "outline",
  },
};

const thClass =
  "px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
const tdClass = "px-4 py-3 align-middle";

function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatJoined(at: Date | string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(at),
  );
}

function formatExpires(at: Date | string) {
  const date = new Date(at);
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 1) return "Expires today";
  return `Expires in ${days} days`;
}

function canManageTarget(
  actorRole: Role | undefined,
  targetRole: Role,
): boolean {
  if (!actorRole) return false;
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") {
    return targetRole === "member" || targetRole === "viewer";
  }
  return false;
}

function assignableRoles(actorRole: Role | undefined): Role[] {
  if (actorRole === "owner") return [...ASSIGNABLE_ROLES];
  if (actorRole === "admin") return ["member", "viewer"];
  return [];
}

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role]!;
  return (
    <Badge variant={meta.badgeVariant} className="normal-case tracking-normal">
      {meta.label}
    </Badge>
  );
}

function RoleSelector({
  value,
  onChange,
  options,
  disabled,
  name,
}: {
  value: Role;
  onChange: (role: Role) => void;
  options: Role[];
  disabled?: boolean;
  name: string;
}) {
  return (
    <div className="space-y-2">
      {options.map((role) => {
        const meta = ROLE_META[role]!;
        const selected = value === role;

        return (
          <label
            key={role}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              selected
                ? "border-primary/40 bg-primary/5"
                : "border-border/60 hover:bg-muted/30",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(role)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-medium">{meta.label}</span>
              <span className="block text-xs text-muted-foreground">
                {meta.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function InviteMemberForm({
  workspaceId,
  actorRole,
  onSuccess,
  onCancel,
}: {
  workspaceId: string;
  actorRole: Role | undefined;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roles = assignableRoles(actorRole);

  const form = useForm({
    defaultValues: {
      email: "",
      role: "member" as Role,
    },
    onSubmit: async ({ value }) => {
      const parsed = z
        .object({
          email: z.string().trim().email("Enter a valid email"),
          role: z.enum(ROLE_VALUES),
        })
        .safeParse(value);

      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Invalid form values");
        return;
      }

      setFormError(null);

      try {
        const result = await rpcClient.members.invite({
          workspaceId,
          email: parsed.data.email,
          role: parsed.data.role,
        });
        setInviteUrl(result.inviteUrl);
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Failed to send invite",
        );
      }
    },
  });

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inviteUrl) {
    return (
      <>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            Invite sent. Share the link below with your teammate.
          </div>
          <div className="space-y-1.5">
            <Label>Invite link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteUrl}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => void copyInviteLink()}>
                <CopyIcon />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Link expires in 7 days.
            </p>
          </div>
        </div>
        <SheetFooter className="border-t">
          <Button type="button" onClick={onSuccess}>
            Done
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) =>
              !value.trim()
                ? "Email is required"
                : !z.string().email().safeParse(value.trim()).success
                  ? "Enter a valid email"
                  : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
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

        <form.Field name="role">
          {(field) => (
            <div className="space-y-2">
              <Label>Role</Label>
              <RoleSelector
                name="invite-role"
                value={field.state.value}
                onChange={field.handleChange}
                options={roles}
              />
            </div>
          )}
        </form.Field>

        {formError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {formError}
          </p>
        )}
      </div>

      <SheetFooter className="border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={form.state.isSubmitting} loadingText="Sending...">
          Send invite
        </Button>
      </SheetFooter>
    </form>
  );
}

function EditMemberForm({
  member,
  actorRole,
  currentUserId,
  onSuccess,
  onCancel,
}: {
  member: Member;
  actorRole: Role | undefined;
  currentUserId: string | undefined;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState("");
  const [isRemoving, setIsRemoving] = useState(false);
  const confirm = useConfirm();

  const editable = canManageTarget(actorRole, member.role);
  const isSelf = member.userId === currentUserId;
  const roles = assignableRoles(actorRole);
  const removePhrase = `remove ${member.email}`;

  const form = useForm({
    defaultValues: { role: member.role },
    onSubmit: async ({ value }) => {
      if (!editable || value.role === member.role) {
        onSuccess();
        return;
      }

      setFormError(null);

      const ok = await confirm({
        title: "Change member role?",
        description: (
          <>
            <span className="font-medium">{member.name || member.email}</span> will go from{" "}
            <span className="font-medium">{member.role}</span> to{" "}
            <span className="font-medium">{value.role}</span>. Their permissions change
            immediately.
          </>
        ),
        confirmLabel: "Change role",
      });
      if (!ok) return;

      try {
        await rpcClient.members.updateRole({
          memberId: member.id,
          role: value.role,
        });
        onSuccess();
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Failed to update member",
        );
      }
    },
  });

  const handleRemove = async () => {
    if (removeConfirm !== removePhrase) return;

    setIsRemoving(true);
    setFormError(null);

    try {
      await rpcClient.members.remove({ memberId: member.id });
      onSuccess();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    } finally {
      setIsRemoving(false);
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
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <Avatar size="sm">
            <AvatarFallback>{initials(member.name, member.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {member.name || member.email}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.email}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Joined{" "}
            <span className="text-foreground">
              {formatJoined(member.createdAt)}
            </span>
          </p>
          {isSelf && (
            <p className="text-foreground">This is your account.</p>
          )}
        </div>

        {editable ? (
          <form.Field name="role">
            {(field) => (
              <div className="space-y-2">
                <Label>Role</Label>
                <RoleSelector
                  name="member-role"
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={
                    member.role === "owner"
                      ? (["owner"] as Role[])
                      : member.role === "admin" && actorRole === "owner"
                        ? (["admin", ...roles] as Role[])
                        : roles
                  }
                  disabled={member.role === "owner"}
                />
              </div>
            )}
          </form.Field>
        ) : (
          <div className="space-y-2">
            <Label>Role</Label>
            <RoleBadge role={member.role} />
            <p className="text-xs text-muted-foreground">
              You do not have permission to change this member&apos;s role.
            </p>
          </div>
        )}

        {formError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {formError}
          </p>
        )}

        {editable && !isSelf && member.role !== "owner" && (
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-destructive">
                Remove from workspace
              </p>
              <p className="text-xs text-muted-foreground">
                They will lose access immediately. Type{" "}
                <span className="font-mono text-foreground">{removePhrase}</span>{" "}
                to confirm.
              </p>
            </div>
            <Input
              value={removeConfirm}
              onChange={(e) => setRemoveConfirm(e.target.value)}
              placeholder={removePhrase}
              className="font-mono text-xs"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              loading={isRemoving}
              loadingText="Removing..."
              disabled={removeConfirm !== removePhrase || form.state.isSubmitting}
              onClick={() => void handleRemove()}
            >
              Remove member
            </Button>
          </div>
        )}
      </div>

      <SheetFooter className="border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          {editable ? "Cancel" : "Close"}
        </Button>
        {editable && member.role !== "owner" && (
          <Button
            type="submit"
            loading={form.state.isSubmitting}
            loadingText="Saving..."
            disabled={isRemoving}
          >
            Save changes
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

function EditInviteForm({
  invite,
  actorRole,
  onSuccess,
  onCancel,
}: {
  invite: Invite;
  actorRole: Role | undefined;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const confirm = useConfirm();
  const editable = canManageTarget(actorRole, invite.role);
  const roles = assignableRoles(actorRole);

  const form = useForm({
    defaultValues: { role: invite.role },
    onSubmit: async ({ value }) => {
      if (!editable || value.role === invite.role) {
        onSuccess();
        return;
      }

      setFormError(null);

      const ok = await confirm({
        title: "Change invite role?",
        description: (
          <>
            When <span className="font-medium">{invite.email}</span> accepts, they&apos;ll join as{" "}
            <span className="font-medium">{value.role}</span> instead of{" "}
            <span className="font-medium">{invite.role}</span>.
          </>
        ),
        confirmLabel: "Change role",
      });
      if (!ok) return;

      try {
        await rpcClient.members.updateInvite({
          inviteId: invite.id,
          role: value.role,
        });
        onSuccess();
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Failed to update invite",
        );
      }
    },
  });

  const handleRevoke = async () => {
    const ok = await confirm({
      title: "Revoke invite?",
      description: (
        <>
          The invite link sent to <span className="font-medium">{invite.email}</span> will stop
          working. You can invite them again later.
        </>
      ),
      confirmLabel: "Revoke invite",
      destructive: true,
    });
    if (!ok) return;
    setIsRevoking(true);
    setFormError(null);

    try {
      await rpcClient.members.revokeInvite({ inviteId: invite.id });
      onSuccess();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to revoke invite",
      );
    } finally {
      setIsRevoking(false);
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
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <MailIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{invite.email}</p>
            <p className="text-xs text-muted-foreground">Pending invite</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {formatExpires(invite.expiresAt)}
        </p>

        {editable ? (
          <form.Field name="role">
            {(field) => (
              <div className="space-y-2">
                <Label>Role</Label>
                <RoleSelector
                  name="invite-edit-role"
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={
                    invite.role === "admin" && actorRole === "owner"
                      ? (["admin", ...roles] as Role[])
                      : roles
                  }
                />
              </div>
            )}
          </form.Field>
        ) : (
          <div className="space-y-2">
            <Label>Role</Label>
            <RoleBadge role={invite.role} />
          </div>
        )}

        {formError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {formError}
          </p>
        )}

        {editable && (
          <div className="rounded-lg border border-destructive/30 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Revoke this invite if it was sent by mistake or is no longer needed.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              loading={isRevoking}
              loadingText="Revoking..."
              disabled={form.state.isSubmitting}
              onClick={() => void handleRevoke()}
            >
              Revoke invite
            </Button>
          </div>
        )}
      </div>

      <SheetFooter className="border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          {editable ? "Cancel" : "Close"}
        </Button>
        {editable && (
          <Button
            type="submit"
            loading={form.state.isSubmitting}
            loadingText="Saving..."
            disabled={isRevoking}
          >
            Save changes
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

function MembersSettings() {
  const { workspaceId } = Route.useParams();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("invite");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editingInvite, setEditingInvite] = useState<Invite | null>(null);

  const { currentUserId } = useShellContext();

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => rpcClient.workspace.list(),
  });

  const membersQuery = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => rpcClient.members.list({ workspaceId }),
  });

  const workspace = workspacesQuery.data?.find((w) => w.id === workspaceId);
  const actorRole = workspace?.role;
  const canManage = actorRole === "owner" || actorRole === "admin";

  const invitesQuery = useQuery({
    queryKey: ["member-invites", workspaceId],
    queryFn: () => rpcClient.members.listInvites({ workspaceId }),
    enabled: canManage,
  });

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const isLoading = membersQuery.isLoading || workspacesQuery.isLoading;
  const isFetching =
    membersQuery.isFetching || (canManage && invitesQuery.isFetching);

  const openInviteSheet = () => {
    setSheetMode("invite");
    setEditingMember(null);
    setEditingInvite(null);
    setSheetOpen(true);
  };

  const openEditMemberSheet = (member: Member) => {
    setSheetMode("edit-member");
    setEditingMember(member);
    setEditingInvite(null);
    setSheetOpen(true);
  };

  const openEditInviteSheet = (invite: Invite) => {
    setSheetMode("edit-invite");
    setEditingInvite(invite);
    setEditingMember(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingMember(null);
    setEditingInvite(null);
  };

  const refreshMembers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["members", workspaceId] });
    await queryClient.invalidateQueries({
      queryKey: ["member-invites", workspaceId],
    });
  };

  const handleSheetSuccess = async () => {
    closeSheet();
    await refreshMembers();
  };

  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = ROLES.indexOf(b.role) - ROLES.indexOf(a.role);
    if (roleOrder !== 0) return roleOrder;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });

  const sortedInvites = [...invites].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate font-medium">Members</h1>
          <p className="text-xs text-muted-foreground">
            Invite teammates and manage workspace access. Admins can change roles
            and revoke pending invites.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshMembers()}
            disabled={isFetching}
          >
            <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={openInviteSheet}>
              <UserPlusIcon />
              Invite member
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!canManage && (
          <p className="mb-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Only workspace admins can invite members or edit permissions.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members.length === 0 && invites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <UsersIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No members yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Invite your team to collaborate on queue monitoring and
                  alerts.
                </p>
              </div>
              {canManage && (
                <Button size="sm" onClick={openInviteSheet}>
                  <PlusIcon />
                  Invite your first teammate
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/80">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b border-border text-left">
                  <th className={thClass}>Member</th>
                  <th className={thClass}>Role</th>
                  <th className={thClass}>Status</th>
                  <th className={cn(thClass, "hidden sm:table-cell")}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => {
                  const rowEditable =
                    canManageTarget(actorRole, member.role) ||
                    member.userId === currentUserId;

                  return (
                    <tr
                      key={member.id}
                      className={cn(
                        "border-b border-border/60 transition-colors last:border-0",
                        rowEditable &&
                          "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      )}
                      tabIndex={rowEditable ? 0 : undefined}
                      onClick={() => {
                        if (rowEditable) openEditMemberSheet(member);
                      }}
                      onKeyDown={(e) => {
                        if (!rowEditable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditMemberSheet(member);
                        }
                      }}
                    >
                      <td className={tdClass}>
                        <div className="flex items-center gap-3">
                          <Avatar size="sm">
                            <AvatarFallback>
                              {initials(member.name, member.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {member.name || member.email}
                              {member.userId === currentUserId && (
                                <span className="ml-1.5 text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <RoleBadge role={member.role} />
                      </td>
                      <td className={tdClass}>
                        <Badge variant="success" className="normal-case tracking-normal">
                          Active
                        </Badge>
                      </td>
                      <td className={cn(tdClass, "hidden text-muted-foreground sm:table-cell")}>
                        {formatJoined(member.createdAt)}
                      </td>
                    </tr>
                  );
                })}

                {sortedInvites.map((invite) => {
                  const rowEditable = canManageTarget(actorRole, invite.role);

                  return (
                    <tr
                      key={invite.id}
                      className={cn(
                        "border-b border-border/60 transition-colors last:border-0",
                        rowEditable &&
                          "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      )}
                      tabIndex={rowEditable ? 0 : undefined}
                      onClick={() => {
                        if (rowEditable) openEditInviteSheet(invite);
                      }}
                      onKeyDown={(e) => {
                        if (!rowEditable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditInviteSheet(invite);
                        }
                      }}
                    >
                      <td className={tdClass}>
                        <div className="flex items-center gap-3">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted/50">
                            <MailIcon className="size-3 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{invite.email}</p>
                            <p className="truncate text-muted-foreground">
                              Invitation pending
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <RoleBadge role={invite.role} />
                      </td>
                      <td className={tdClass}>
                        <Badge variant="warning" className="normal-case tracking-normal">
                          Pending
                        </Badge>
                      </td>
                      <td className={cn(tdClass, "hidden text-muted-foreground sm:table-cell")}>
                        {formatExpires(invite.expiresAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && (members.length > 0 || invites.length > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"}
            {invites.length > 0 &&
              ` · ${invites.length} pending ${invites.length === 1 ? "invite" : "invites"}`}
          </p>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>
              {sheetMode === "invite" && "Invite member"}
              {sheetMode === "edit-member" && "Edit member"}
              {sheetMode === "edit-invite" && "Edit invite"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "invite" &&
                "Send an email invite with a role for this workspace."}
              {sheetMode === "edit-member" &&
                "Update this member's role or remove them from the workspace."}
              {sheetMode === "edit-invite" &&
                "Change the invited role or revoke the pending invite."}
            </SheetDescription>
          </SheetHeader>

          {sheetMode === "invite" && (
            <InviteMemberForm
              key="invite"
              workspaceId={workspaceId}
              actorRole={actorRole}
              onSuccess={() => void handleSheetSuccess()}
              onCancel={closeSheet}
            />
          )}

          {sheetMode === "edit-member" && editingMember && (
            <EditMemberForm
              key={editingMember.id}
              member={editingMember}
              actorRole={actorRole}
              currentUserId={currentUserId}
              onSuccess={() => void handleSheetSuccess()}
              onCancel={closeSheet}
            />
          )}

          {sheetMode === "edit-invite" && editingInvite && (
            <EditInviteForm
              key={editingInvite.id}
              invite={editingInvite}
              actorRole={actorRole}
              onSuccess={() => void handleSheetSuccess()}
              onCancel={closeSheet}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
