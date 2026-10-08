import { describe, expect, it } from "vitest";
import { scorePassword } from "@/components/auth/password-input";

describe("scorePassword", () => {
  it("returns empty for no input", () => {
    expect(scorePassword("")).toEqual({ score: 0, label: "" });
  });

  it("caps short passwords at weak", () => {
    expect(scorePassword("Ab1!").score).toBe(1);
  });

  it("rewards length and variety", () => {
    expect(scorePassword("abcdefgh").label).toBe("Weak");
    expect(scorePassword("abcdefghijkl").label).toBe("Fair");
    expect(scorePassword("Abcdefghijkl").label).toBe("Good");
    expect(scorePassword("Abcdefghijk1!").label).toBe("Strong");
  });
});
