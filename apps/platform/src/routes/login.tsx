import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authClient } from "@/lib/auth";
import {
  authCallbackUrl,
  refreshSession,
  resolveAuthenticatedLanding,
  safeRedirectPath,
} from "@/lib/auth-helpers";
import {
  formatAuthError,
  getLastEmail,
  isEmailNotVerifiedError,
  loginSchema,
  setLastEmail,
} from "@/lib/auth-form";
import { sessionQueryOptions } from "@/lib/session-query";
import {
  AuthFieldError,
  AuthFormError,
  AuthLayout,
} from "@/components/auth/auth-layout";
import { PasswordInput } from "@/components/auth/password-input";
import { VerificationNotice } from "@/components/auth/verification-notice";
import { Button } from "@unqueue/ui/components/button";
import { Input } from "@unqueue/ui/components/input";
import { Label } from "@unqueue/ui/components/label";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(sessionQueryOptions());
  const [redirectFailed, setRedirectFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(
    null,
  );
  const user = sessionQuery.data?.data?.user;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setRedirectFailed(false);

    void resolveAuthenticatedLanding(queryClient).then((landing) => {
      if (cancelled) return;
      if (!landing) {
        setRedirectFailed(true);
        return;
      }

      navigate({
        to: landing.to,
        params: landing.params,
        replace: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, user]);

  const [rememberedEmail] = useState(getLastEmail);

  const form = useForm({
    defaultValues: { email: rememberedEmail, password: "" },
    onSubmit: async ({ value }) => {
      const parsed = loginSchema.safeParse(value);
      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Invalid form values");
        return;
      }

      setFormError(null);
      setPendingVerificationEmail(null);

      const result = await authClient.signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: authCallbackUrl("/verify-email"),
      });

      if (result.error) {
        if (isEmailNotVerifiedError(result.error)) {
          setPendingVerificationEmail(parsed.data.email);
        }
        setFormError(formatAuthError(result.error, "Invalid email or password"));
        return;
      }

      setLastEmail(parsed.data.email);
      const session = await refreshSession(queryClient);
      if (!session.data?.user) {
        setFormError("Sign in succeeded but no session was created. Try again.");
        return;
      }

      navigate({ href: safeRedirectPath(redirectTo) });
    },
  });

  if (pendingVerificationEmail) {
    return (
      <AuthLayout
        title="Verify your email"
        description="You need to confirm your email before signing in."
        footer={
          <>
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => setPendingVerificationEmail(null)}
            >
              Back to sign in
            </button>
          </>
        }
      >
        <VerificationNotice email={pendingVerificationEmail} />
      </AuthLayout>
    );
  }

  if (user && !redirectFailed) {
    return (
      <AuthLayout
        title="Redirecting"
        description="Taking you to your workspace."
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          Loading your workspace…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to check on your queues."
      footer={
        <>
          New to Unqueue?{" "}
          <Link to="/signup" className="font-medium text-foreground hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
      >
        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) => {
              if (!value.trim()) return "Email is required";
              if (!z.string().email().safeParse(value.trim()).success) {
                return "Enter a valid email";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus={!rememberedEmail}
                placeholder="you@company.com"
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (formError) setFormError(null);
                }}
                onBlur={field.handleBlur}
                aria-invalid={!!field.state.meta.errors.length}
                disabled={form.state.isSubmitting}
              />
              <AuthFieldError message={field.state.meta.errors[0]} />
            </div>
          )}
        </form.Field>

        <form.Field
          name="password"
          validators={{
            onChange: ({ value }) =>
              !value ? "Password is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/forgot-password",
                      search: { email: form.getFieldValue("email").trim() || undefined },
                    })
                  }
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                autoFocus={!!rememberedEmail}
                placeholder="Enter your password"
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (formError) setFormError(null);
                }}
                onBlur={field.handleBlur}
                aria-invalid={!!field.state.meta.errors.length}
                disabled={form.state.isSubmitting}
              />
              <AuthFieldError message={field.state.meta.errors[0]} />
            </div>
          )}
        </form.Field>

        {formError ? <AuthFormError message={formError} /> : null}

        <Button
          type="submit"
          className="h-9 w-full"
          loading={form.state.isSubmitting}
          loadingText="Signing in..."
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
