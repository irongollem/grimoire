import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { needsInitiativeRoll } from "./useNeedsInitiativeRoll";

const c = (party_member_id: string | null, initiative: number | null) =>
  ({ party_member_id, initiative }) as unknown as RunCombatant;

describe("needsInitiativeRoll", () => {
  it("is true when my combatant has no initiative", () => {
    expect(needsInitiativeRoll([c("m1", null), c("m2", 12)], "m1")).toBe(true);
  });
  it("is false once rolled", () => {
    expect(needsInitiativeRoll([c("m1", 14)], "m1")).toBe(false);
  });
  it("is false when I am not in the encounter or have no character", () => {
    expect(needsInitiativeRoll([c("m2", null)], "m1")).toBe(false);
    expect(needsInitiativeRoll([c("m1", null)], null)).toBe(false);
    expect(needsInitiativeRoll(null, "m1")).toBe(false);
  });
});
