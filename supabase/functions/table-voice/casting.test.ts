import { describe, expect, it } from "vitest";
import { castNpc, JEV_MAX_OPTIONS, narrowByTraits, pickByKey, usedAtPlace, type SlotAssignment, type VoiceSlot } from "./casting";

const slot = (id: string, over: Partial<VoiceSlot> = {}): VoiceSlot => ({ id, name: `Name ${id}`, description: `d ${id}`, sex: null, age: null, service: "elevenlabs", voiceId: `voice-${id}-xxxx`, ...over });
const wy1 = slot("wy1", { sex: "woman", age: "young" });
const wy2 = slot("wy2", { sex: "woman", age: "young" });
const wa = slot("wa", { sex: "woman", age: "adult" });
const mo = slot("mo", { sex: "man", age: "old" });
const pool = [wy1, wy2, wa, mo];
const none = async () => null;

describe("narrowByTraits", () => {
  it("keeps to the character's sex and age", () => {
    expect(narrowByTraits(pool, { sex: "woman", age: "adult" })).toEqual([wa]);
    expect(narrowByTraits(pool, { sex: "man", age: null })).toEqual([mo]);
  });

  // Bug caught: an old woman given the old man's voice because no old woman exists.
  it("keeps to the sex when no slot of that age exists, rather than crossing to the other sex", () => {
    expect(narrowByTraits(pool, { sex: "woman", age: "old" }).every((s) => s.sex === "woman")).toBe(true);
  });

  // Bug caught: a sex nobody has emptying the pool.
  it("casts from everyone when nothing narrows to someone", () => {
    expect(narrowByTraits([mo], { sex: "woman", age: null })).toEqual([mo]);
  });
});

describe("pickByKey", () => {
  // Bug caught: a character changing voice between lines.
  it("gives the same key the same slot every time", () => {
    const first = pickByKey("honeycomb", pool).id;
    for (let i = 0; i < 5; i++) expect(pickByKey("honeycomb", pool).id).toBe(first);
  });

  // Bug caught: everyone of one kind sharing a voice.
  it("spreads different keys over the slots that fit", () => {
    const got = new Set("abcdefgh".split("").map((k) => pickByKey(k, pool, { sex: "woman", age: "young" }).id));
    expect(got).toEqual(new Set(["wy1", "wy2"]));
  });

  // Bug caught: `hash % length`, where one slot added to the registry re-voiced nearly every player's character and
  // stranger, so the same character sounded different from one sitting to the next.
  it("keeps almost every speaker's voice when a slot is added, and moves only the retired slot's speakers when one goes", () => {
    const big = Array.from({ length: 10 }, (_, i) => slot(`s${i}`));
    const keys = Array.from({ length: 200 }, (_, i) => `speaker-${i}`);
    const before = new Map(keys.map((k) => [k, pickByKey(k, big).id]));

    const grown = [...big, slot("s10")];
    const moved = keys.filter((k) => pickByKey(k, grown).id !== before.get(k));
    expect(moved.every((k) => pickByKey(k, grown).id === "s10")).toBe(true);
    expect(moved.length).toBeLessThan(keys.length / 5);

    const shrunk = big.filter((s) => s.id !== "s3");
    for (const k of keys) if (before.get(k) !== "s3") expect(pickByKey(k, shrunk).id).toBe(before.get(k));
  });
});

describe("usedAtPlace", () => {
  const rows: SlotAssignment[] = [
    { npcId: "a", slotId: "wa", locationId: "inn" },
    { npcId: "me", slotId: "mo", locationId: "inn" },
    { npcId: "b", slotId: "wy1", locationId: "farm" },
  ];
  // Bug caught: a character's own slot, or another place's, counted as taken.
  it("counts only other characters at the same place", () => {
    expect(usedAtPlace(rows, "me", "inn")).toEqual(new Set(["wa"]));
  });
  // Bug caught: everyone with no place treated as standing in one place.
  it("counts nothing for a character found nowhere", () => {
    expect(usedAtPlace([{ npcId: "a", slotId: "wa", locationId: null }], "me", null)).toEqual(new Set());
  });
});

describe("castNpc", () => {
  const input = { npcId: "me", traits: { sex: null, age: null }, fitting: "a baker", locationId: "inn", pool, assignments: [] as SlotAssignment[] };

  // Bug caught: casting from an empty pool throwing instead of letting the caller fall back.
  it("answers null for an empty pool", async () => {
    expect(await castNpc({ ...input, pool: [] }, none)).toBeNull();
  });

  // Bug caught: the least used slot not preferred, so one voice is given to everybody.
  it("without a judgment takes the slot used least in the campaign", async () => {
    const assignments: SlotAssignment[] = [wy1, wy2, wa].map((s, i) => ({ npcId: `n${i}`, slotId: s.id, locationId: null }));
    expect((await castNpc({ ...input, assignments }, none))?.slot).toBe(mo);
  });

  // Bug caught: more than 40 options sent, or the most used kept instead of the least used.
  it("shows the judge at most 40 slots, the least used", async () => {
    const many = Array.from({ length: 50 }, (_, i) => slot(`s${i}`));
    const assignments: SlotAssignment[] = many.slice(0, 10).map((s, i) => ({ npcId: `n${i}`, slotId: s.id, locationId: null }));
    let shown: string[] = [];
    await castNpc({ ...input, pool: many, assignments }, async (options) => ((shown = options.map((o) => o.name)), null));
    expect(shown).toHaveLength(JEV_MAX_OPTIONS);
    expect(shown).not.toContain("Name s0");
    expect(shown).toContain("Name s10");
  });

  // Bug caught: two slots with one name collapsing into a single option, so one can never be chosen.
  it("tells slots of the same name apart and maps the answer back to the right one", async () => {
    const a = slot("a", { name: "Shady guy" });
    const b = slot("b", { name: "Shady guy" });
    const pick = (i: number) => castNpc({ ...input, pool: [a, b] }, async (options) => ({ choice: options[i].name, inputTokens: 3 }));
    const [first, second] = [await pick(0), await pick(1)];
    expect(first?.slot).not.toBe(second?.slot);
    expect(first?.inputTokens).toBe(3);
  });
});
