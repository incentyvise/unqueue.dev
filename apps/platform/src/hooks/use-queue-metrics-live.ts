import { useEffect, useMemo, useState } from "react";
import type { QueueMetrics } from "@unqueue/bullmq";
import type { EnvironmentQueueRow } from "@/components/environment-queues-table";
import { rpcClient } from "@/lib/api";
import { queueKey } from "@/lib/queue-health";
import { onSocketEvent } from "@/lib/socket";

function parseQueueRoom(room: string): string | null {
  if (!room.startsWith("queue:")) return null;
  const rest = room.slice("queue:".length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  return `${rest.slice(0, sep)}:${rest.slice(sep + 1)}`;
}

/**
 * Fetches 5m rolling metrics for every queue once, then keeps them fresh from
 * `metrics:update` socket events (rooms are subscribed by
 * useEnvironmentQueueSync).
 */
export function useQueueMetricsLive(queues: EnvironmentQueueRow[]) {
  const [metrics, setMetrics] = useState<Record<string, QueueMetrics>>({});
  const signature = useMemo(() => queues.map(queueKey).join(","), [queues]);

  useEffect(() => {
    if (queues.length === 0) return;
    let cancelled = false;

    void Promise.all(
      queues.map(async (q) => {
        try {
          const m = await rpcClient.queue.getMetrics({
            redisInstanceId: q.redisInstanceId,
            queueName: q.name,
            window: "5m",
          });
          if (!cancelled) {
            setMetrics((prev) => ({ ...prev, [queueKey(q)]: m }));
          }
        } catch {
          // metrics are best-effort; the row falls back to "—"
        }
      }),
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    return onSocketEvent((data) => {
      if (data.type !== "metrics:update") return;
      const key = parseQueueRoom(data.room);
      if (!key) return;
      const payload = data.payload as { metrics?: QueueMetrics };
      if (!payload?.metrics) return;
      setMetrics((prev) => ({ ...prev, [key]: payload.metrics! }));
    });
  }, []);

  return metrics;
}
