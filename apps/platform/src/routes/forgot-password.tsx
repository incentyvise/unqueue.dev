import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, MailCheckIcon } from "lucide-react";
import { z } from "zod";
import { authClient } from "@/lib/auth";
import { authCallbackUrl } from "@/lib/auth-helpers";
import { formatAuthError } from "@/lib/auth-form";
import {
  AuthFieldError,
  AuthFormError,
  AuthLayout,
} from "@/components/auth/auth-layout";
import { Button } from "@unqueue/ui/components/button";
import { Input } from "@unqueue/ui/components/input";
import { Label } from "@unqueue/ui/components/label";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: z.object({ email: z.string().optional() }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { email: initialEmail } = Route.useSearch();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailError = !email.trim()
    ? "Email is required"
    : !z.string().email().safeParse(email.trim()).success
      ? "Enter a valid email"
      : undefined;

  const submit = async () => {
    setTouched(true);
    if (emailError) return;
    setSubmitting(true);
    setError(null);
    const result = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: authCallbackUrl("/reset-password"),
    });
    setSubmitting(false);
    if (result.error) {
      setError(formatAuthError(result.error, "Could not send reset email"));
      return;
    }
    setSentTo(email.trim());
  };

  const backToLogin = (
    <Link
      to="/login"
      className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
    >
      <ArrowLeftIcon className="size-3.5" />
      Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="If an account exists for that email, a reset link is on its way."
        footer={backToLogin}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <MailCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Reset link sent to {sentTo}</p>
              <p className="text-muted-foreground">
                The link expires in an hour. Check spam if it doesn&apos;t arrive in a minute.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a reset link."
      footer={backToLogin}
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
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !!emailError}
            disabled={submitting}
          />
          <AuthFieldError message={touched ? emailError : undefined} />
        </div>
        {error ? <AuthFormError message={error} /> : null}
        <Button
          type="submit"
          className="h-9 w-full"
          loading={submitting}
          loadingText="Sending link..."
        >
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
