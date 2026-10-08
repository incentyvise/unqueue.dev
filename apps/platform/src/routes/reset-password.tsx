import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { formatAuthError } from "@/lib/auth-form";
import {
  AuthFieldError,
  AuthFormError,
  AuthLayout,
} from "@/components/auth/auth-layout";
import {
  PasswordInput,
  PasswordStrengthMeter,
} from "@/components/auth/password-input";
import { Button } from "@unqueue/ui/components/button";
import { Label } from "@unqueue/ui/components/label";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        description="You can now sign in with your new password."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            All set. Other sessions stay signed in until they expire.
          </div>
          <Button asChild className="h-9 w-full">
            <Link to="/login">Continue to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (!token || linkError) {
    return (
      <AuthLayout
        title="Link expired"
        description="This password reset link is invalid or has already been used."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              Reset links expire after an hour and work only once. Request a fresh one below.
            </p>
          </div>
          <Button asChild className="h-9 w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const passwordError = !password
    ? "Password is required"
    : password.length < 8
      ? "Password must be at least 8 characters"
      : undefined;
  const confirmError = confirm !== password ? "Passwords don't match" : undefined;

  const submit = async () => {
    setTouched(true);
    if (passwordError || confirmError) return;
    setSubmitting(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setSubmitting(false);
    if (result.error) {
      setError(formatAuthError(result.error, "Could not reset password"));
      return;
    }
    setDone(true);
    toast.success("Password updated");
    void navigate({ to: "/reset-password", search: {}, replace: true });
  };

  return (
    <AuthLayout
      title="Choose a new password"
      description="Pick something you don't use anywhere else."
      footer={
        <Link to="/login" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={touched && !!passwordError}
            disabled={submitting}
          />
          <PasswordStrengthMeter password={password} />
          <AuthFieldError message={touched ? passwordError : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">Confirm password</Label>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={touched && !!confirmError}
            disabled={submitting}
          />
          <AuthFieldError message={touched ? confirmError : undefined} />
        </div>
        {error ? <AuthFormError message={error} /> : null}
        <Button
          type="submit"
          className="h-9 w-full"
          loading={submitting}
          loadingText="Updating..."
        >
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
