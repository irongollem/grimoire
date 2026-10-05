import { describe, expect, it } from "vitest";
import { hideOutcome } from "@/rules/hide";

describe("hideOutcome", () => {
  it("2024 hides on a total of 15 or more", () => {
    expect(hideOutcome(15, "2024").hidden).toBe(true);
    expect(hideOutcome(22, "2024").hidden).toBe(true);
  });

  it("2024 does not hide below DC 15 and says so", () => {
    const out = hideOutcome(12, "2024");
    expect(out.hidden).toBe(false);
    expect(out.message).toBe("Stealth 12: not hidden (DC 15).");
  });

  it("2014 always marks hidden, whatever the total, for the DM to contest", () => {
    expect(hideOutcome(3, "2014").hidden).toBe(true);
    expect(hideOutcome(3, "2014").message).toContain("Stealth 3");
  });
});
