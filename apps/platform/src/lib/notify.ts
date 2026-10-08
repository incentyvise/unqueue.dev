import { toast } from "sonner";

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/**
 * Runs a mutation with loading → success/error toasts. Returns the result, or
 * undefined when the action failed (the error toast is already shown).
 */
export async function withToast<T>(
  action: () => Promise<T>,
  messages: {
    loading?: string;
    success: string | ((result: T) => string);
    error?: string;
  },
): Promise<T | undefined> {
  const id = messages.loading ? toast.loading(messages.loading) : undefined;
  try {
    const result = await action();
    const success =
      typeof messages.success === "function"
        ? messages.success(result)
        : messages.success;
    toast.success(success, { id });
    return result;
  } catch (error) {
    toast.error(messages.error ?? "Action failed", {
      id,
      description: errorMessage(error),
    });
    return undefined;
  }
}

export function bulkResultMessage(
  verb: string,
  result: { succeeded: string[]; failed: string[] },
): string {
  const ok = result.succeeded.length;
  const bad = result.failed.length;
  const noun = (n: number) => (n === 1 ? "job" : "jobs");
  if (bad === 0) return `${verb} ${ok.toLocaleString()} ${noun(ok)}`;
  return `${verb} ${ok.toLocaleString()} ${noun(ok)} · ${bad.toLocaleString()} skipped`;
}
