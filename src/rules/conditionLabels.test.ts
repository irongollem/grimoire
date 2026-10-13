import { describe, expect, it } from "vitest";
import {
  describeConditionEnd,
  describeConditionSource,
  describeOngoing,
  type NameOf,
} from "@/rules/conditionLabels";

const names: Record<string, string> = { vex: "Vex" };
const nameOf: NameOf = (id) => names[id] ?? null;

describe("describeConditionEnd", () => {
  it("is null without ends", () => {
    expect(describeConditionEnd({ name: "Prone" }, nameOf)).toBeNull();
  });

  it("reads a self turn edge", () => {
    expect(describeConditionEnd({ name: "X", ends: { kind: "turn", at: "end", of: "self" } }, nameOf)).toBe(
      "until the end of its next turn",
    );
    expect(describeConditionEnd({ name: "X", ends: { kind: "turn", at: "start", of: "self" } }, nameOf)).toBe(
      "until the start of its next turn",
    );
  });

  it("adds a save end's round cap (#1055)", () => {
    const save = (at: "start" | "end", remaining: number) =>
      ({ name: "X", ends: { kind: "save", ability: "wis", dc: 14, at, remaining } }) as const;
    expect(describeConditionEnd(save("end", 3), nameOf)).toBe("save ends · WIS 14 · 3 rounds left");
    expect(describeConditionEnd(save("start", 1), nameOf)).toBe("save ends · WIS 14 at turn start · 1 round left");
  });

  it("names the source's turn when the viewer may see it", () => {
    const c = { name: "X", source: { id: "vex" }, ends: { kind: "turn", at: "end", of: "source" } } as const;
    expect(describeConditionEnd(c, nameOf)).toBe("until the end of Vex's next turn");
  });

  it("does not name a hidden or missing source", () => {
    const hidden = { name: "X", source: { id: "ghost" }, ends: { kind: "turn", at: "end", of: "source" } } as const;
    expect(describeConditionEnd(hidden, nameOf)).toBe("until the end of its source's next turn");
    const none = { name: "X", ends: { kind: "turn", at: "end", of: "source" } } as const;
    expect(describeConditionEnd(none, nameOf)).toBe("until the end of its source's next turn");
  });

  it("counts rounds", () => {
    expect(describeConditionEnd({ name: "X", ends: { kind: "rounds", remaining: 1 } }, nameOf)).toBe("1 round left");
    expect(describeConditionEnd({ name: "X", ends: { kind: "rounds", remaining: 3 } }, nameOf)).toBe("3 rounds left");
  });

  it("reads a repeat save", () => {
    expect(
      describeConditionEnd({ name: "X", ends: { kind: "save", ability: "wis", dc: 14, at: "end" } }, nameOf),
    ).toBe("save ends · WIS 14");
    expect(
      describeConditionEnd({ name: "X", ends: { kind: "save", ability: "wis", dc: 14, at: "start" } }, nameOf),
    ).toBe("save ends · WIS 14 at turn start");
  });
});

describe("describeConditionSource", () => {
  it("joins name and spell", () => {
    expect(describeConditionSource({ name: "X", source: { id: "vex", spell: "Hold Person" } }, nameOf)).toBe(
      "Vex · Hold Person",
    );
  });

  it("drops an unnamed creature", () => {
    expect(describeConditionSource({ name: "X", source: { id: "ghost", spell: "Hold Person" } }, nameOf)).toBe(
      "Hold Person",
    );
  });

  it("falls back to the name alone", () => {
    expect(describeConditionSource({ name: "X", source: { id: "vex" } }, nameOf)).toBe("Vex");
  });

  it("is null with neither, or without a source", () => {
    expect(describeConditionSource({ name: "X", source: { id: "ghost" } }, nameOf)).toBeNull();
    expect(describeConditionSource({ name: "X" }, nameOf)).toBeNull();
  });

  it("marks concentration when there is text", () => {
    expect(
      describeConditionSource({ name: "X", source: { id: "vex", spell: "Hold Person", concentration: true } }, nameOf),
    ).toBe("Vex · Hold Person (concentration)");
    expect(describeConditionSource({ name: "X", source: { id: "ghost", concentration: true } }, nameOf)).toBeNull();
  });
});

describe("describeOngoing", () => {
  it("reads typed damage at either edge", () => {
    expect(describeOngoing({ dice: "2d6", type: "fire", at: "start" })).toBe("2d6 fire at the start of each turn");
    expect(describeOngoing({ dice: "2d6", type: "fire", at: "end" })).toBe("2d6 fire at the end of each turn");
  });

  it("says plain damage without a type", () => {
    expect(describeOngoing({ dice: "2d6", type: null, at: "start" })).toBe("2d6 damage at the start of each turn");
  });
});
