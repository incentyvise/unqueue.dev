import { describe, expect, it } from "vitest";
import { groupFailedJobs, normalizeErrorMessage } from "./queue-service.js";

describe("normalizeErrorMessage", () => {
  it("replaces volatile tokens with placeholders", () => {
    expect(normalizeErrorMessage("Order 123 not found")).toBe("Order <n> not found");
    expect(
      normalizeErrorMessage(
        "User 3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f missing field 'email'",
      ),
    ).toBe("User <uuid> missing field <str>");
  });

  it("keeps only the first line and handles empty reasons", () => {
    expect(normalizeErrorMessage("Boom\n    at foo.js:1:2")).toBe("Boom");
    expect(normalizeErrorMessage(undefined)).toBe("Unknown error");
    expect(normalizeErrorMessage("")).toBe("Unknown error");
  });
});

describe("groupFailedJobs", () => {
  it("groups by job name and normalised message, newest first within ties", () => {
    const groups = groupFailedJobs([
      { id: "1", name: "send-email", finishedOn: 100, failedReason: "Timeout after 30s", stacktrace: [] },
      { id: "2", name: "send-email", finishedOn: 300, failedReason: "Timeout after 45s", stacktrace: [] },
      { id: "3", name: "send-email", finishedOn: 200, failedReason: "Invalid address", stacktrace: [] },
      { id: "4", name: "charge", finishedOn: 50, failedReason: "Timeout after 30s", stacktrace: [] },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      name: "send-email",
      message: "Timeout after <n>s",
      count: 2,
      jobIds: ["1", "2"],
      latestJobId: "2",
      latestFailedAt: 300,
      firstFailedAt: 100,
      failedReason: "Timeout after 45s",
    });
    expect(groups.map((g) => g.name)).toEqual(["send-email", "send-email", "charge"]);
  });
});
