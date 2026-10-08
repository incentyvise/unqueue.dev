import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@unqueue/ui/components/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  onKeyUp,
  onBlur,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          className={cn("pr-9", className)}
          onKeyUp={(e) => {
            setCapsLock(e.getModifierState?.("CapsLock") ?? false);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
        </button>
      </div>
      {capsLock && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400" role="status">
          Caps Lock is on
        </p>
      )}
    </div>
  );
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export function scorePassword(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (password.length < 8) score = Math.min(score, 1);
  const clamped = Math.min(4, Math.max(1, score)) as PasswordStrength["score"];
  return {
    score: clamped,
    label: ["", "Weak", "Fair", "Good", "Strong"][clamped]!,
  };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  if (!password) return null;
  const color = [
    "bg-muted",
    "bg-destructive",
    "bg-amber-500",
    "bg-sky-500",
    "bg-emerald-500",
  ][score];

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= score ? color : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="w-12 text-right text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
