import { describe, expect, it } from "vitest";
import { disadvantageNote } from "@/rules/rollModeNotes";

const ATTACKS_AND_CHECKS = ["attack rolls", "ability checks"] as const;

describe("disadvantageNote", () => {
  it("is empty with no conditions", () => {
    expect(disadvantageNote([], "2014", ATTACKS_AND_CHECKS)).toBe("");
  });

  it("names a condition and what it affects", () => {
    expect(disadvantageNote([{ name: "Poisoned" }], "2024", ATTACKS_AND_CHECKS)).toBe(
      "Poisoned: disadvantage on attack rolls and ability checks.",
    );
  });

  // app convention: notes group conditions sharing an effect.
  it("groups conditions with the same effect and splits different ones", () => {
    expect(disadvantageNote([{ name: "Poisoned" }, { name: "Frightened" }, { name: "Blinded" }], "2024", ATTACKS_AND_CHECKS)).toBe(
      "Poisoned and Frightened: disadvantage on attack rolls and ability checks. Blinded: disadvantage on attack rolls.",
    );
  });

  it("limits the sentence to the rolls the surface shows", () => {
    expect(disadvantageNote([{ name: "Blinded" }], "2024", ["ability checks"])).toBe("");
    expect(disadvantageNote([{ name: "Poisoned" }], "2024", ["ability checks"])).toBe(
      "Poisoned: disadvantage on ability checks.",
    );
  });

  // PHB 2014 "Exhaustion": level 1 is disadvantage on ability checks, level 3 adds attack rolls and saves.
  // 2024 PHB "Exhaustion": a flat penalty to D20 Tests, no disadvantage.
  // PHB 2014 "Restrained": disadvantage on Dexterity saving throws.
  it("names Restrained for Dexterity saving throws only when the surface shows them", () => {
    expect(disadvantageNote([{ name: "Restrained" }], "2024", ["Dexterity saving throws"])).toBe(
      "Restrained: disadvantage on Dexterity saving throws.",
    );
    expect(disadvantageNote([{ name: "Restrained" }], "2024", ["ability checks"])).toBe("");
  });

  it("reads 2014 exhaustion as disadvantage, and 2024 as none", () => {
    expect(disadvantageNote([{ name: "Exhaustion", level: 1 }], "2014", ["ability checks"])).toBe(
      "Exhaustion 1: disadvantage on ability checks.",
    );
    expect(disadvantageNote([{ name: "Exhaustion", level: 3 }], "2014", ["attack rolls", "ability checks"])).toBe(
      "Exhaustion 3: disadvantage on attack rolls and ability checks.",
    );
    expect(disadvantageNote([{ name: "Exhaustion", level: 3 }], "2024", ATTACKS_AND_CHECKS)).toBe("");
  });
});
