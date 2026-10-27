import { describe, expect, it } from "vitest";
import { hideOutcome } from "@/rules/hide";

describe("hideOutcome", () => {
  // 2024 PHB "Hide" (Dexterity (Stealth) check, DC 15)
  it("2024 hides at exactly 15, not at 14", () => {
    expect(hideOutcome(15, "2024").hidden).toBe(true);
    expect(hideOutcome(14, "2024").hidden).toBe(false);
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
