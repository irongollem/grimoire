import { describe, expect, it } from "vitest";
import { INVENTIONS_SHOWN, inventionsSection, parseRulingInput, pendingFrom, planRuling, RULING_NOTE_MAX, type InventionRuling, type PendingInvention } from "./invention";
import type { InventionDraft } from "../invention/types";

const A = "00000000-0000-4000-8000-0000000000d1";
const B = "00000000-0000-4000-8000-0000000000d2";
const C = "00000000-0000-4000-8000-0000000000d3";
const D = "00000000-0000-4000-8000-0000000000d4";

const inv = (id: string, createdAt: string, over: Partial<PendingInvention> = {}): PendingInvention => ({
  id, createdAt, discipline: "tinkering", name: `Thing ${id.slice(-1)}`, rarity: "uncommon", itemType: "wondrous_item", value: "100 gp",
  rules: null, mechanics: [], warnings: [], newMaterials: [], ...over,
});

describe("inventionsSection", () => {
  // Bug caught: the Narrator was not given the id it must name, or the checker's warning it must look hard at.
  it("shows each invention's id, name, rarity, value, discipline, mechanics, warnings and proposed materials", () => {
    const text = inventionsSection([inv(A, "2026-11-18T10:00:00Z", {
      name: "Glowmoss Lantern", rules: "Sheds dim light.", mechanics: ["3 charges, dawn", "advantage on Stealth"],
      warnings: ["The text mentions fire damage but none is declared."], newMaterials: ["Moon moss (rare, 50 gp)"],
    })]);
    for (const part of [A, "Glowmoss Lantern", "uncommon", "100 gp", "tinkering", "Rules: Sheds dim light.", "3 charges, dawn; advantage on Stealth",
      "Warning: The text mentions fire damage but none is declared.", "Proposes a new material: Moon moss (rare, 50 gp)"]) {
      expect(text).toContain(part);
    }
  });

  // Bug caught: a section header with nothing under it told the Narrator there was something to rule on.
  it("is absent with none waiting", () => {
    expect(inventionsSection([])).toBe("");
  });

  // Bug caught: the newest three shown and the oldest left waiting for ever; or more than three crowding the turn.
  it("shows the oldest three, whatever order they arrive in", () => {
    const text = inventionsSection([inv(D, "2026-11-19T10:00:00Z"), inv(B, "2026-11-17T10:00:00Z"), inv(C, "2026-11-18T10:00:00Z"), inv(A, "2026-11-16T10:00:00Z")]);
    expect(INVENTIONS_SHOWN).toBe(3);
    expect(text).toContain(A);
    expect(text).toContain(B);
    expect(text).toContain(C);
    expect(text).not.toContain(D);
    expect(text.indexOf(A)).toBeLessThan(text.indexOf(B));
  });
});

describe("pendingFrom", () => {
  const draft = (over: Partial<InventionDraft["item"]> = {}): InventionDraft => ({
    item: { ref: null, new: { name: "Lamp", item_type: "wondrous_item", subtype: null, rarity: "uncommon", cost: "40 gp", value_cp: 4000, weight: null, flavor: "", rules_text: "Line one.\n\nLine two.", description: "", requires_attunement: false, attunement_requirements: null, charges: null, recharge: null, damage_rolls: null, armor_class: null, properties: [], tags: [] }, name: "Lamp", rarity: "uncommon", item_type: "wondrous_item", value_cp: 4000, ...over },
    mechanics: [{ kind: "ac_bonus", value: 1 }, { kind: "spell", name: "Light", level: 0 }],
    quantity: 1,
    recipe: { name: "Lamp", description: "", dc: 12, requires_proficiency: false, requires_tools: true, special_requirement: null, crafting_time: 1, crafting_time_unit: "hours" },
    ingredients: [
      { ref: { item_id: "i1" }, new: null, name: "Oil", rarity: "common", value_cp: 10, quantity: 1 },
      { ref: null, new: { name: "Moon moss", item_type: "crafting_material", rarity: "rare", cost: "50 gp", value_cp: 5000, description: "", tags: [] }, name: "Moon moss", rarity: "rare", value_cp: 5000, quantity: 1 },
    ],
    materials_value_cp: 5010, value_multiple: 2, value_limit_cp: 10020, rarity_ceiling: "rare", adjustments: [], warnings: ["w1"],
  });

  it("words the mechanics and the rules on one line, and lists only the materials that are new", () => {
    const p = pendingFrom({ id: A, createdAt: "2026-11-18T10:00:00Z", discipline: "tinkering", draft: draft() });
    expect(p.mechanics).toEqual(["+1 to AC", "the cantrip Light"]);
    expect(p.rules).toBe("Line one. Line two.");
    expect(p.value).toBe("40 gp");
    expect(p.newMaterials).toEqual(["Moon moss (rare, 50 gp)"]);
    expect(p.warnings).toEqual(["w1"]);
  });

  // Bug caught: an existing item shown with a made-up price or rules, when the draft only points at it.
  it("shows an existing item by its copper value and with no rules text", () => {
    const p = pendingFrom({ id: A, createdAt: "2026-11-18T10:00:00Z", discipline: "tinkering", draft: draft({ new: null, ref: { item_id: "i9" } }) });
    expect(p.value).toBe("4000 cp");
    expect(p.rules).toBeNull();
  });
});

describe("parseRulingInput", () => {
  it("refuses a missing id, an unknown decision and a note that is not text", () => {
    expect(parseRulingInput({ decision: "approve" }).ok).toBe(false);
    expect(parseRulingInput({ invention_id: A, decision: "maybe" }).ok).toBe(false);
    expect(parseRulingInput({ invention_id: A, decision: "return", note: 5 }).ok).toBe(false);
  });

  // Bug caught: a send-back with no note, or a blank one, leaving the player to guess what to change.
  it("refuses a return with no note or a blank one", () => {
    expect(parseRulingInput({ invention_id: A, decision: "return" }).ok).toBe(false);
    expect(parseRulingInput({ invention_id: A, decision: "return", note: "   " }).ok).toBe(false);
  });

  // Bug caught: a note over the column's check (1000) that made the whole ruling fail in the database.
  it("accepts a note of exactly 1000 characters and refuses 1001", () => {
    expect(parseRulingInput({ invention_id: A, decision: "return", note: "x".repeat(RULING_NOTE_MAX) }).ok).toBe(true);
    expect(parseRulingInput({ invention_id: A, decision: "return", note: "x".repeat(RULING_NOTE_MAX + 1) }).ok).toBe(false);
  });

  // Bug caught: an approval carrying a stray note into the database, which stores it as the DM's note.
  it("drops the note of an approval", () => {
    expect(parseRulingInput({ invention_id: A, decision: "approve", note: "lovely" })).toEqual({ ok: true, value: { inventionId: A, decision: "approve", note: null } });
  });
});

describe("planRuling", () => {
  const pending = [inv(A, "2026-11-16T10:00:00Z", { name: "Lamp" }), inv(B, "2026-11-17T10:00:00Z")];

  it("plans an approval and a return in the words the tool promises", () => {
    const ok = planRuling(pending, [], { invention_id: A, decision: "approve" });
    expect(ok).toEqual({ ok: true, ruling: { inventionId: A, decision: "approve", note: null, name: "Lamp" }, says: "When the turn is kept, Lamp is approved." });
    const back = planRuling(pending, [], { invention_id: A, decision: "return", note: "Too bright." });
    expect(back).toMatchObject({ ok: true, says: "When the turn is kept, Lamp is returned with your note.", ruling: { note: "Too bright." } });
  });

  // Bug caught: an id the model invented, or a fourth invention that was not shown, ruled on.
  it("refuses an id that was not shown, naming those that were", () => {
    const refused = planRuling(pending, [], { invention_id: C, decision: "approve" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain(A);
    const fourth = [inv(A, "2026-11-16T10:00:00Z"), inv(B, "2026-11-17T10:00:00Z"), inv(C, "2026-11-18T10:00:00Z"), inv(D, "2026-11-19T10:00:00Z")];
    expect(planRuling(fourth, [], { invention_id: D, decision: "approve" }).ok).toBe(false);
  });

  // Bug caught: two rulings on one invention in a turn.
  it("refuses a second ruling on the same invention but allows one on another", () => {
    const first: InventionRuling = { inventionId: A, decision: "approve", note: null, name: "Lamp" };
    expect(planRuling(pending, [first], { invention_id: A, decision: "return", note: "no" }).ok).toBe(false);
    expect(planRuling(pending, [first], { invention_id: B, decision: "approve" }).ok).toBe(true);
  });
});
