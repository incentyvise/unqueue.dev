import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra content between description and buttons (e.g. a summary). */
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  typeToConfirm?: string;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide confirmation dialog. `await confirm({...})` resolves true only when
 * the user explicitly confirms; closing, Escape, or Cancel resolve false.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
    setTyped("");
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A new request supersedes any pending one.
    resolverRef.current?.(false);
    setOptions(next);
    setTyped("");
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const canConfirm = !options?.typeToConfirm || typed === options.typeToConfirm;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        {options && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description && (
                <AlertDialogDescription asChild>
                  <div>{options.description}</div>
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>

            {options.details}

            {options.typeToConfirm && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Type{" "}
                  <span className="font-mono font-medium text-foreground">
                    {options.typeToConfirm}
                  </span>{" "}
                  to confirm.
                </p>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canConfirm) settle(true);
                  }}
                  placeholder={options.typeToConfirm}
                  autoFocus
                  aria-label="Confirmation text"
                />
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel>{options.cancelLabel ?? "Cancel"}</AlertDialogCancel>
              <Button
                variant={options.destructive ? "destructive" : "default"}
                disabled={!canConfirm}
                autoFocus={!options.typeToConfirm}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within ConfirmProvider");
  return confirm;
}
