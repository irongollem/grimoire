import { describe, expect, it } from "vitest";
import { disadvantageNote } from "@/rules/rollModeNotes";

const ATTACKS_AND_CHECKS = ["attack rolls", "ability checks"] as const;

describe("disadvantageNote", () => {
  it("is empty with no conditions", () => {
    expect(disadvantageNote([], "2014", ATTACKS_AND_CHECKS)).toBe("");
  });

  it("names a condition and what it affects", () => {
    expect(disadvantageNote(["Poisoned"], "2024", ATTACKS_AND_CHECKS)).toBe(
      "Poisoned: disadvantage on attack rolls and ability checks.",
    );
  });

  it("groups conditions with the same effect and splits different ones", () => {
    expect(disadvantageNote(["Poisoned", "Frightened", "Blinded"], "2024", ATTACKS_AND_CHECKS)).toBe(
      "Poisoned and Frightened: disadvantage on attack rolls and ability checks. Blinded: disadvantage on attack rolls.",
    );
  });

  it("limits the sentence to the rolls the surface shows", () => {
    expect(disadvantageNote(["Blinded"], "2024", ["ability checks"])).toBe("");
    expect(disadvantageNote(["Poisoned"], "2024", ["ability checks"])).toBe(
      "Poisoned: disadvantage on ability checks.",
    );
  });

  it("reads 2014 exhaustion as disadvantage, and 2024 as none", () => {
    expect(disadvantageNote(["Exhausted 1"], "2014", ["ability checks"])).toBe(
      "Exhaustion 1: disadvantage on ability checks.",
    );
    expect(disadvantageNote(["Exhausted 3"], "2014", ["attack rolls", "ability checks"])).toBe(
      "Exhaustion 3: disadvantage on attack rolls and ability checks.",
    );
    expect(disadvantageNote(["Exhausted 3"], "2024", ATTACKS_AND_CHECKS)).toBe("");
  });
});
