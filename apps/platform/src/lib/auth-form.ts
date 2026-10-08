import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").min(2, "Name must be at least 2 characters"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});

export function formatAuthError(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    if ("code" in error && error.code === "EMAIL_NOT_VERIFIED") {
      return "Verify your email before signing in. Check your inbox for a verification link.";
    }
    if (
      "message" in error &&
      typeof error.message === "string" &&
      error.message.trim().length > 0
    ) {
      return error.message;
    }
  }
  return fallback;
}

export function isEmailNotVerifiedError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EMAIL_NOT_VERIFIED"
  );
}

const LAST_EMAIL_KEY = "unqueue-last-email";

export function getLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLastEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // storage unavailable; the field simply won't be prefilled next time
  }
}
