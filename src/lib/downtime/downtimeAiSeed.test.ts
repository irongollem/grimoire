import { describe, it, expect } from "vitest";
import {
  DowntimeAiParseError,
  effectsFromAi,
  rewardFromAi,
  seedFromAiResult,
} from "@/lib/downtime/downtimeAiSeed";

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

  it("never trusts an `applied: true` from the model, whatever the kind", () => {
    const out = effectsFromAi([
      { kind: "gold", applied: true, gp: 10 },
      { kind: "hp", applied: true, delta: -2 },
      { kind: "condition", applied: true, condition: "Poisoned" },
    ]);
    expect(out.map((e) => e.applied)).toEqual([false, false, false]);
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
  it("builds an npc reward from trimmed fields, with a safe default relationship", () => {
    expect(
      rewardFromAi(
        { kind: "npc", npc: { name: " Sela ", race: "Half-elf", alignment: "Neutral", occupation: "Fence", appearance: "Wiry", personality: "Terse", backstory: "Old debts", tags: [" a ", 3, "", "b"] } },
        "npc",
      ),
    ).toEqual({
      kind: "npc",
      npc: { name: "Sela", race: "Half-elf", alignment: "Neutral", occupation: "Fence", appearance: "Wiry", personality: "Terse", backstory: "Old debts", relationship: "indifferent", tags: ["a", "b"], portrait_url: null },
    });
  });

  it("turns a blank optional field into null rather than an empty string", () => {
    const out = rewardFromAi({ kind: "npc", npc: { name: "S", race: "  ", occupation: 4 } }, "npc");
    expect(out).toMatchObject({ npc: { race: null, occupation: null } });
  });

  it("keeps a valid relationship", () => {
    const out = rewardFromAi({ kind: "npc", npc: { name: "S", relationship: "helpful" } }, "npc");
    expect(out).toMatchObject({ npc: { relationship: "helpful" } });
  });

  it("throws, naming both kinds, when the model drafts the wrong reward kind for the archetype", () => {
    expect(() => rewardFromAi({ kind: "item", item: {} }, "npc")).toThrow(/item reward for an archetype that yields npc/);
    // Even a well-formed reward of the wrong kind is refused, not quietly minted.
    expect(() => rewardFromAi({ kind: "npc", npc: { name: "S" } }, "item")).toThrow(/npc reward for an archetype that yields item/);
  });

  it("throws when the reward is missing or its entity is", () => {
    expect(() => rewardFromAi(undefined, "npc")).toThrow(DowntimeAiParseError);
    expect(() => rewardFromAi({ kind: "npc" }, "npc")).toThrow(/no NPC/);
  });

  it("throws when the npc has no name, or only blank space", () => {
    expect(() => rewardFromAi({ kind: "npc", npc: {} }, "npc")).toThrow(DowntimeAiParseError);
    expect(() => rewardFromAi({ kind: "npc", npc: { name: "   " } }, "npc")).toThrow(DowntimeAiParseError);
  });

  it("throws for a reward type it has no builder for", () => {
    expect(() => rewardFromAi({ kind: "spell" }, "spell")).toThrow(/No AI reward builder/);
  });

  it("builds an item reward, keeping a valid item_type and rarity", () => {
    expect(
      rewardFromAi(
        { kind: "item", item: { name: "T", description: "d", item_type: "weapon", rarity: "uncommon", subtype: "dagger", cost: "2 gp", weight: 1.5, tags: ["x"] } },
        "item",
      ),
    ).toEqual({
      kind: "item",
      item: { name: "T", item_type: "weapon", subtype: "dagger", rarity: "uncommon", requires_attunement: false, weight: 1.5, cost: "2 gp", description: "d", tags: ["x"], image_url: null },
    });
  });

  it("reads a missing or non-numeric weight as null, not zero", () => {
    expect(rewardFromAi({ kind: "item", item: { name: "T", description: "d", weight: "heavy" } }, "item")).toMatchObject({ item: { weight: null } });
    expect(rewardFromAi({ kind: "item", item: { name: "T", description: "d" } }, "item")).toMatchObject({ item: { weight: null } });
  });

  it("falls back to mundane rarity rather than something powerful", () => {
    const out = rewardFromAi({ kind: "item", item: { name: "Thing", description: "d", rarity: "mythic" } }, "item");
    expect(out).toMatchObject({ item: { rarity: "mundane" } });
  });

  it("falls back to gear for an unknown item_type", () => {
    const out = rewardFromAi({ kind: "item", item: { name: "T", description: "d", item_type: "spaceship" } }, "item");
    expect(out).toMatchObject({ item: { item_type: "gear" } });
  });

  it("only a literal true makes an item need attunement", () => {
    const attunement = (v: unknown) => rewardFromAi({ kind: "item", item: { name: "T", description: "d", requires_attunement: v } }, "item");
    expect(attunement("yes")).toMatchObject({ item: { requires_attunement: false } });
    expect(attunement(undefined)).toMatchObject({ item: { requires_attunement: false } });
    expect(attunement(true)).toMatchObject({ item: { requires_attunement: true } });
  });

  it("builds a note, keeping a valid category and falling back to general", () => {
    expect(rewardFromAi({ kind: "note", note: { title: "T", body: "B", category: "lore", tags: ["r"] } }, "note")).toEqual({
      kind: "note",
      note: { title: "T", body: "B", category: "lore", tags: ["r"] },
    });
    expect(rewardFromAi({ kind: "note", note: { title: "T", body: "B", category: "rumours" } }, "note")).toMatchObject({ note: { category: "general" } });
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
    expect(npc).toMatchObject({ npc: { portrait_url: null } });

    const item = rewardFromAi(
      {
        kind: "item",
        item: { name: "T", description: "d", image_url: "https://evil.example/y.png" },
      },
      "item",
    );
    expect(item).toMatchObject({ item: { image_url: null } });
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
    expect(seed.id).toBe("ai:carouse");
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
