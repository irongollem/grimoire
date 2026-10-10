import { describe, expect, it } from "vitest";
import type { ActionStructure } from "../../src/types/statBlock.types.ts";
import { type ExtractedAction, contractBlocker, entryKey, expandStatBlock, groupExtractions, sha1 } from "./structureRows.ts";

const SWORD =
  "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.";

function block() {
  return {
    name: "Guard",
    actions: [{ name: "Shortsword", description: SWORD }],
    damage_resistances: "fire",
    damage_immunities: "poison",
    damage_vulnerabilities: "",
    condition_immunities: "charmed",
  };
}

type Next = {
  actions: { structured: ActionStructure }[];
  defenses: unknown;
  damage_resistances?: string;
  special_abilities?: unknown;
};

describe("expandStatBlock", () => {
  it("structures every entry, adds defenses and keeps the four strings", () => {
    const r = expandStatBlock(block());
    const next = r.next as Next;
    expect(r.changed).toBe(true);
    expect(r.alreadyStructured).toBe(false);
    expect(next.actions[0].structured.kind).toBe("attack");
    expect(next.defenses).toBeDefined();
    expect(next).toMatchObject({
      damage_resistances: "fire",
      damage_immunities: "poison",
      damage_vulnerabilities: "",
      condition_immunities: "charmed",
    });
    expect(r.stats.kinds.attack).toBe(1);
  });

  it("is idempotent", () => {
    const first = expandStatBlock(block()).next;
    const again = expandStatBlock(first);
    expect(again.changed).toBe(false);
    expect(again.alreadyStructured).toBe(true);
  });

  it("leaves an absent list absent and does not invent string keys", () => {
    const r = expandStatBlock({ name: "X", actions: [{ name: "Gaze", description: "Stares." }] });
    const next = r.next as Next;
    expect(next.special_abilities).toBeUndefined();
    expect("damage_resistances" in (r.next as object)).toBe(false);
  });

  const odd: ActionStructure = { kind: "other", source: "extracted" };
  const extraction = (over: Partial<ExtractedAction> = {}): Map<string, ExtractedAction> =>
    groupExtractions([
      { id: "r", list: "actions", idx: 0, name: "Gaze", description_sha1: sha1("Stares."), structured: odd, ...over },
    ]).get("r") as Map<string, ExtractedAction>;
  const gaze = () => ({ actions: [{ name: "Gaze", description: "Stares." }] });

  it("applies an extraction with the current sha1", () => {
    const r = expandStatBlock(gaze(), extraction());
    expect((r.next as Next).actions[0].structured.source).toBe("extracted");
    expect(r.stats.extractedApplied).toBe(1);
    expect(r.stats.extractedStale).toBe(0);
  });

  it("skips and counts a stale extraction", () => {
    const r = expandStatBlock(gaze(), extraction({ description_sha1: sha1("Old prose.") }));
    expect((r.next as Next).actions[0].structured.source).toBe("parsed");
    expect(r.stats.extractedStale).toBe(1);
    expect(r.stats.extractedApplied).toBe(0);
  });

  it("never replaces a manual structure", () => {
    const manual: ActionStructure = { kind: "other", source: "manual" };
    const b = { actions: [{ name: "Gaze", description: "Stares.", structured: manual }] };
    const r = expandStatBlock(b, extraction());
    expect((r.next as Next).actions[0].structured).toEqual(manual);
    expect(r.stats.extractedApplied).toBe(0);
  });

  it("returns a non-object block untouched", () => {
    expect(expandStatBlock(null).changed).toBe(false);
  });

  it("keys entries by list and position", () => {
    expect(entryKey("actions", 2)).toBe("actions:2");
  });
});

describe("contractBlocker (the contract migration's refusal rule)", () => {
  const emptyDefs = { resistances: [], immunities: [], vulnerabilities: [], condition_immunities: [] };
  const structured = { kind: "other", source: "parsed" };

  it("refuses a block without defenses, or with an unstructured entry", () => {
    expect(contractBlocker({ actions: [] })).toBe("unstructured");
    expect(contractBlocker({ defenses: emptyDefs, actions: [{ name: "Bite", description: "x" }] })).toBe("unstructured");
  });

  it("refuses old defense text that the typed defenses do not hold", () => {
    expect(contractBlocker({ defenses: emptyDefs, damage_resistances: "fire" })).toBe("text-without-defenses");
  });

  it("passes junk strings, typed defenses, a note, and blocks that are not objects", () => {
    expect(contractBlocker({ defenses: emptyDefs, damage_resistances: "False", damage_immunities: "[]" })).toBeNull();
    expect(contractBlocker({ defenses: { ...emptyDefs, resistances: [{ types: ["fire"] }] }, damage_resistances: "fire" })).toBeNull();
    expect(contractBlocker({ defenses: { ...emptyDefs, notes: "damage from spells" }, damage_resistances: "damage from spells" })).toBeNull();
    expect(contractBlocker({ defenses: emptyDefs, actions: [{ name: "Bite", description: "x", structured }] })).toBeNull();
    expect(contractBlocker(null)).toBeNull();
  });

  it("passes every block expandStatBlock produces", () => {
    const { next } = expandStatBlock({ damage_resistances: "fire; bludgeoning from nonmagical attacks", actions: [{ name: "Bite", description: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage." }] });
    expect(contractBlocker(next)).toBeNull();
  });
});
