import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    'button, a[href], summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="checkbox"]',
  );
}

function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
}

/**
 * Single-key and two-key ("g o") shortcuts. Ignored while typing in inputs,
 * when a modifier is held, or (unless allowInOverlay) while a dialog is open.
 */
export function useHotkeys(
  map: HotkeyMap,
  { enabled = true, allowInOverlay = false }: { enabled?: boolean; allowInOverlay?: boolean } = {},
) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (!allowInOverlay && hasOpenOverlay()) return;

      const key = event.key === " " ? "space" : event.key;
      // Let Enter/Space keep activating whatever control has focus.
      if ((key === "Enter" || key === "space") && isActivatableTarget(event.target)) return;
      const combo = pending ? `${pending} ${key}` : key;
      const handler = mapRef.current[combo];

      if (handler) {
        event.preventDefault();
        pending = null;
        handler(event);
        return;
      }

      const isPrefix = Object.keys(mapRef.current).some((k) => k.startsWith(`${key} `));
      if (!pending && isPrefix) {
        pending = key;
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          pending = null;
        }, 1000);
        return;
      }
      pending = null;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(pendingTimer);
    };
  }, [enabled, allowInOverlay]);
}
