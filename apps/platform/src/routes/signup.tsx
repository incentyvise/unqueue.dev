import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authClient } from "@/lib/auth";
import {
  authCallbackUrl,
  refreshSession,
  resolveAuthenticatedLanding,
} from "@/lib/auth-helpers";
import { formatAuthError, setLastEmail, signupSchema } from "@/lib/auth-form";
import { sessionQueryOptions } from "@/lib/session-query";
import {
  AuthFieldError,
  AuthFormError,
  AuthLayout,
} from "@/components/auth/auth-layout";
import {
  PasswordInput,
  PasswordStrengthMeter,
} from "@/components/auth/password-input";
import { VerificationNotice } from "@/components/auth/verification-notice";
import { Button } from "@unqueue/ui/components/button";
import { Input } from "@unqueue/ui/components/input";
import { Label } from "@unqueue/ui/components/label";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
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

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      const parsed = signupSchema.safeParse(value);
      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Invalid form values");
        return;
      }

      setFormError(null);

      const result = await authClient.signUp.email({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: authCallbackUrl("/verify-email"),
      });

      if (result.error) {
        setFormError(formatAuthError(result.error, "Could not create your account"));
        return;
      }

      setLastEmail(parsed.data.email);

      const session = await refreshSession(queryClient);
      if (session.data?.user) {
        navigate({ to: "/" });
        return;
      }

      setPendingVerificationEmail(parsed.data.email);
    },
  });

  if (pendingVerificationEmail) {
    return (
      <AuthLayout
        title="Almost there"
        description="Verify your email to finish creating your account."
        footer={
          <>
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => {
                setPendingVerificationEmail(null);
                form.reset();
              }}
            >
              Use a different email
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
      title="Create your account"
      description="Free for solo devs and small teams. Connect Redis in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground hover:underline">
            Sign in
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
          name="name"
          validators={{
            onChange: ({ value }) => {
              const trimmed = value.trim();
              if (!trimmed) return "Name is required";
              if (trimmed.length < 2) return "Name must be at least 2 characters";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="signup-name">Name</Label>
              <Input
                id="signup-name"
                autoComplete="name"
                autoFocus
                placeholder="Jane Doe"
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
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
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
            onChange: ({ value }) => {
              if (!value) return "Password is required";
              if (value.length < 8) return "Password must be at least 8 characters";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="signup-password">Password</Label>
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (formError) setFormError(null);
                }}
                onBlur={field.handleBlur}
                aria-invalid={!!field.state.meta.errors.length}
                disabled={form.state.isSubmitting}
              />
              <PasswordStrengthMeter password={field.state.value} />
              <AuthFieldError message={field.state.meta.errors[0]} />
            </div>
          )}
        </form.Field>

        {formError ? <AuthFormError message={formError} /> : null}

        <Button
          type="submit"
          className="h-9 w-full"
          loading={form.state.isSubmitting}
          loadingText="Creating account..."
        >
          Create account
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          No credit card. We&apos;ll email you a link to verify your address.
        </p>
      </form>
    </AuthLayout>
  );
}
