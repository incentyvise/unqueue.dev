import { describe, expect, it } from "vitest";
import { getQueueHealth } from "./queue-health";

const counts = { failed: 0, waiting: 0, delayed: 0, active: 0 };

describe("getQueueHealth", () => {
  it("prioritises paused over failures", () => {
    expect(getQueueHealth({ isPaused: true, counts: { ...counts, failed: 3 } })).toBe("paused");
  });

  it("flags failures, then backlog, then activity", () => {
    expect(getQueueHealth({ isPaused: false, counts: { ...counts, failed: 1, waiting: 50 } })).toBe("failed");
    expect(getQueueHealth({ isPaused: false, counts: { ...counts, waiting: 6, delayed: 4 } })).toBe("backlog");
    expect(getQueueHealth({ isPaused: false, counts: { ...counts, active: 2, waiting: 3 } })).toBe("active");
    expect(getQueueHealth({ isPaused: false, counts })).toBe("idle");
  });
});
