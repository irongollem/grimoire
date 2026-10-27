import { describe, expect, it } from "vitest";
import { emptyDefenses } from "@/types/statBlock.types";
import { applyDefenseText, defenseText } from "./defenseFields";

describe("defense fields", () => {
  it("replaces only the edited category", () => {
    const base = { ...emptyDefenses(), immunities: [{ types: ["poison" as const] }] };
    const next = applyDefenseText(base, "resistances", "fire; cold");
    expect(next.immunities).toEqual(base.immunities);
    expect(defenseText(next, "resistances")).toBe("fire; cold");
  });

  it("edits each category through its own field", () => {
    const next = applyDefenseText(emptyDefenses(), "immunities", "poison");
    expect(next.immunities[0]?.types).toEqual(["poison"]);
    expect(next.resistances).toEqual([]);
    expect(applyDefenseText(emptyDefenses(), "vulnerabilities", "fire").vulnerabilities[0]?.types).toEqual(["fire"]);
  });

  it("adds a new unreadable note to the ones already there instead of replacing them", () => {
    const first = applyDefenseText(emptyDefenses(), "resistances", "fire; damage from spells");
    const second = applyDefenseText(first, "immunities", "poison; weird things");
    expect(second.notes).toContain("damage from spells");
    expect(second.notes).toContain("weird things");
  });

  it("parses condition immunities", () => {
    const next = applyDefenseText(emptyDefenses(), "condition_immunities", "charmed, exhaustion");
    expect(next.condition_immunities).toEqual(["Charmed", "Exhaustion"]);
    expect(defenseText(next, "condition_immunities")).toBe("charmed, exhaustion");
  });

  it("keeps unreadable words as a note, once", () => {
    let d = applyDefenseText(emptyDefenses(), "resistances", "fire; damage from spells");
    expect(d.notes).toBeTruthy();
    const notes = d.notes;
    d = applyDefenseText(d, "resistances", "fire; damage from spells");
    expect(d.notes).toBe(notes);
  });
});
