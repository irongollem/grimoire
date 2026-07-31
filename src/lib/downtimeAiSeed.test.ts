import { describe, it, expect } from "vitest";
import {
  DowntimeAiParseError,
  effectsFromAi,
  rewardFromAi,
  seedFromAiResult,
} from "@/lib/downtimeAiSeed";

// The model's JSON is untrusted input. These tests pin the airlock's policy:
// drop what we cannot honour, throw only on what we cannot do without.

describe("effectsFromAi", () => {
  it("returns nothing for a non-array", () => {
    expect(effectsFromAi(undefined)).toEqual([]);
    expect(effectsFromAi("gold")).toEqual([]);
  });

  it("accepts a gold effect and forces applied=false", () => {
    const out = effectsFromAi([
      { kind: "gold", note: "A night of rounds", cp: 0, sp: 0, ep: 0, gp: -5, pp: 0 },
    ]);
    expect(out).toEqual([
      { kind: "gold", applied: false, note: "A night of rounds", cp: 0, sp: 0, ep: 0, gp: -5, pp: 0 },
    ]);
  });

  it("never trusts an `applied: true` from the model", () => {
    const out = effectsFromAi([{ kind: "gold", applied: true, gp: 10 }]);
    expect(out[0].applied).toBe(false);
  });

  it("drops an all-zero gold effect rather than show a checkbox that does nothing", () => {
    expect(effectsFromAi([{ kind: "gold", cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }])).toEqual([]);
  });

  it("defaults missing coin fields to zero", () => {
    const out = effectsFromAi([{ kind: "gold", gp: 7 }]);
    expect(out[0]).toMatchObject({ kind: "gold", cp: 0, sp: 0, ep: 0, gp: 7, pp: 0 });
  });

  it("accepts an hp effect and drops a zero delta", () => {
    expect(effectsFromAi([{ kind: "hp", delta: -6 }])[0]).toMatchObject({ kind: "hp", delta: -6 });
    expect(effectsFromAi([{ kind: "hp", delta: 0 }])).toEqual([]);
  });

  it("rounds a fractional hp delta", () => {
    expect(effectsFromAi([{ kind: "hp", delta: -6.7 }])[0]).toMatchObject({ delta: -7 });
  });

  it("accepts a real SRD condition, case-insensitively, and canonicalises it", () => {
    const out = effectsFromAi([{ kind: "condition", condition: "exhaustion" }]);
    expect(out[0]).toMatchObject({ kind: "condition", condition: "Exhaustion" });
  });

  it("drops a hallucinated condition", () => {
    expect(effectsFromAi([{ kind: "condition", condition: "Hungover" }])).toEqual([]);
  });

  it("drops an invented effect kind", () => {
    expect(effectsFromAi([{ kind: "xp", amount: 100 }])).toEqual([]);
  });

  it("drops an `item` effect — no seed emits one and we cannot mint the item_id", () => {
    expect(effectsFromAi([{ kind: "item", item_id: "abc", qty: 1 }])).toEqual([]);
  });

  it("keeps the good effects alongside the bad ones it drops", () => {
    const out = effectsFromAi([
      { kind: "condition", condition: "Hungover" },
      { kind: "hp", delta: -3 },
      { kind: "nonsense" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "hp", delta: -3 });
  });

  it("normalises a blank note to null", () => {
    expect(effectsFromAi([{ kind: "hp", delta: 2, note: "  " }])[0].note).toBeNull();
  });
});

describe("rewardFromAi", () => {
  const npc = { kind: "npc", npc: { name: "Sela", description: "x" } };

  it("builds an npc reward with a safe default relationship", () => {
    const out = rewardFromAi(npc, "npc");
    expect(out).toMatchObject({ kind: "npc" });
    if (out.kind === "npc") {
      expect(out.npc.name).toBe("Sela");
      expect(out.npc.relationship).toBe("indifferent");
      expect(out.npc.tags).toEqual([]);
    }
  });

  it("keeps a valid relationship", () => {
    const out = rewardFromAi({ kind: "npc", npc: { name: "S", relationship: "helpful" } }, "npc");
    if (out.kind === "npc") expect(out.npc.relationship).toBe("helpful");
  });

  it("throws when the model drafts the wrong reward kind for the archetype", () => {
    expect(() => rewardFromAi({ kind: "item", item: {} }, "npc")).toThrow(DowntimeAiParseError);
  });

  it("throws when the npc has no name", () => {
    expect(() => rewardFromAi({ kind: "npc", npc: {} }, "npc")).toThrow(DowntimeAiParseError);
  });

  it("falls back to mundane rarity rather than something powerful", () => {
    const out = rewardFromAi(
      { kind: "item", item: { name: "Thing", description: "d", rarity: "mythic" } },
      "item",
    );
    if (out.kind === "item") expect(out.item.rarity).toBe("mundane");
  });

  it("falls back to gear for an unknown item_type", () => {
    const out = rewardFromAi(
      { kind: "item", item: { name: "T", description: "d", item_type: "spaceship" } },
      "item",
    );
    if (out.kind === "item") expect(out.item.item_type).toBe("gear");
  });

  it("keeps a valid item_type and rarity", () => {
    const out = rewardFromAi(
      { kind: "item", item: { name: "T", description: "d", item_type: "weapon", rarity: "uncommon" } },
      "item",
    );
    if (out.kind === "item") {
      expect(out.item.item_type).toBe("weapon");
      expect(out.item.rarity).toBe("uncommon");
    }
  });

  it("coerces requires_attunement to a real boolean", () => {
    const out = rewardFromAi(
      { kind: "item", item: { name: "T", description: "d", requires_attunement: "yes" } },
      "item",
    );
    if (out.kind === "item") expect(out.item.requires_attunement).toBe(false);
  });

  it("falls back to the general note category", () => {
    const out = rewardFromAi(
      { kind: "note", note: { title: "T", body: "B", category: "rumours" } },
      "note",
    );
    if (out.kind === "note") expect(out.note.category).toBe("general");
  });

  it("throws when a note has no body", () => {
    expect(() => rewardFromAi({ kind: "note", note: { title: "T" } }, "note")).toThrow(
      DowntimeAiParseError,
    );
  });

  // Art is canonical and admin-uploaded. A URL from the model would be an
  // unvalidated remote reference pointing anywhere at all.
  it("never takes an image URL from the model", () => {
    const npc = rewardFromAi(
      { kind: "npc", npc: { name: "S", portrait_url: "https://evil.example/x.png" } },
      "npc",
    );
    if (npc.kind === "npc") expect(npc.npc.portrait_url).toBeNull();

    const item = rewardFromAi(
      {
        kind: "item",
        item: { name: "T", description: "d", image_url: "https://evil.example/y.png" },
      },
      "item",
    );
    if (item.kind === "item") expect(item.item.image_url).toBeNull();
  });
});

describe("seedFromAiResult", () => {
  const good = {
    title: "A friend in low places",
    vignette: "Three drinks in, she finally speaks.",
    proposed_effects: [{ kind: "gold", gp: -5 }],
    reward: { kind: "npc", npc: { name: "Sela" } },
  };

  it("builds a DowntimeSeed the ordinary resolve path can consume", () => {
    const seed = seedFromAiResult(good, "carouse", "npc");
    expect(seed.activityKey).toBe("carouse");
    expect(seed.weight).toBeGreaterThan(0);
    expect(seed.title).toBe("A friend in low places");
    expect(seed.proposedEffects).toHaveLength(1);
    expect(seed.reward.kind).toBe("npc");
  });

  it("throws when there is no title", () => {
    expect(() => seedFromAiResult({ ...good, title: "" }, "carouse", "npc")).toThrow(
      DowntimeAiParseError,
    );
  });

  it("throws when there is no vignette", () => {
    expect(() => seedFromAiResult({ ...good, vignette: undefined }, "carouse", "npc")).toThrow(
      DowntimeAiParseError,
    );
  });

  it("throws on a non-object", () => {
    expect(() => seedFromAiResult("nope", "carouse", "npc")).toThrow(DowntimeAiParseError);
  });

  it("tolerates missing effects entirely", () => {
    const seed = seedFromAiResult({ ...good, proposed_effects: undefined }, "carouse", "npc");
    expect(seed.proposedEffects).toEqual([]);
  });
});
