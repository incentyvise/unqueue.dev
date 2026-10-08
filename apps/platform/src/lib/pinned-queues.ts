import { useCallback, useEffect, useState } from "react";

const PREFIX = "unqueue-pinned-queues";
const EVENT = "unqueue:pinned-queues";

function storageKey(environmentId: string) {
  return `${PREFIX}:${environmentId}`;
}

function read(environmentId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(environmentId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Per-environment pinned queues, kept in localStorage and synced across components. */
export function usePinnedQueues(environmentId: string) {
  const [pinned, setPinned] = useState<string[]>(() => read(environmentId));

  useEffect(() => {
    setPinned(read(environmentId));
    const sync = () => setPinned(read(environmentId));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [environmentId]);

  const toggle = useCallback(
    (key: string) => {
      const current = read(environmentId);
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      try {
        localStorage.setItem(storageKey(environmentId), JSON.stringify(next));
      } catch {
        // storage unavailable: pin lasts for this render only
      }
      setPinned(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [environmentId],
  );

  return { pinned: new Set(pinned), toggle };
}
