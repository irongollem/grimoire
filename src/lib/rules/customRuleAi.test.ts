import { describe, expect, it } from "vitest";
import { normalizeCustomRule, normalizeTracker } from "./customRuleAi";

const base = {
  title: " Grim Rests ",
  category: "Exploration",
  summary: "Rests take longer.",
  trigger: "Whenever a party rests.",
  effect: "A long rest takes 24 hours.",
  exceptions: "Does not change short rests.",
  tags: ["rest", " ", "gritty"],
  tracker: null,
};

const levelTracker = {
  label: "Sanity",
  type: "level",
  min: 0,
  max: 10,
  start: 8,
  levels: [
    { value: 0, label: "Composed", color: "green" },
    { value: 5, label: "Shaken", color: "mauve", effects: [{ type: "save", label: "Fear", ability: "wis", dcBase: 12, dcAddTracker: true }, { type: "bogus", label: "x" }] },
  ],
  triggers: { onLongRest: -1, itemTags: [{ tag: "tonic", delta: -2, mode: "on_consume" }, { tag: "x", delta: 1, mode: "nope" }] },
  dmButtons: [{ label: "Reset", mode: "set", setValue: 0, playerVisible: true }, { label: "Bad", mode: "set", setValue: 99 }],
};

describe("normalizeCustomRule", () => {
  it("builds a document with headings and trims fields", () => {
    const r = normalizeCustomRule(base);
    expect(r?.title).toBe("Grim Rests");
    expect(r?.category).toBe("Exploration");
    expect(r?.tags).toEqual(["rest", "gritty"]);
    const headings = r?.content.content.filter((n) => n.type === "heading");
    expect(headings).toHaveLength(3);
    expect(r?.tracker).toBeNull();
  });

  it("drops an unknown category and rejects a rule with no effect", () => {
    expect(normalizeCustomRule({ ...base, category: "Chaos" })?.category).toBeNull();
    expect(normalizeCustomRule({ ...base, effect: "" })).toBeNull();
    expect(normalizeCustomRule("nope")).toBeNull();
  });

  it("omits the whole exceptions section when empty", () => {
    const r = normalizeCustomRule({ ...base, exceptions: "" });
    expect(r?.content.content.filter((n) => n.type === "heading")).toHaveLength(2);
  });

  it("keeps at most eight tags, and starts the document at the first heading when there is no summary", () => {
    const many = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(normalizeCustomRule({ ...base, tags: many })?.tags).toHaveLength(8);
    const noSummary = normalizeCustomRule({ ...base, summary: "" });
    expect(noSummary?.content.content[0]).toMatchObject({ type: "heading" });
  });

  it("ignores a tracker when not allowed", () => {
    expect(normalizeCustomRule({ ...base, tracker: levelTracker }, false)?.tracker).toBeNull();
  });
});

describe("normalizeTracker", () => {
  it("keeps a valid tracker and filters bad children", () => {
    const t = normalizeTracker(levelTracker);
    expect(t?.start).toBe(8);
    expect(t?.levels?.[1].color).toBeUndefined();
    expect(t?.levels?.[1].effects).toEqual([
      { type: "save", label: "Fear", ability: "WIS", dcBase: 12, dcAddTracker: true },
    ]);
    expect(t?.triggers).toEqual({ onLongRest: -1, itemTags: [{ tag: "tonic", delta: -2, mode: "on_consume" }] });
    expect(t?.dmButtons).toEqual([{ label: "Reset", mode: "set", delta: 0, setValue: 0, playerVisible: true }]);
  });

  it("rejects bad ranges, starts and level order", () => {
    expect(normalizeTracker({ ...levelTracker, min: 10, max: 0 })).toBeNull();
    expect(normalizeTracker({ ...levelTracker, start: 11 })).toBeNull();
    expect(normalizeTracker({ ...levelTracker, levels: [{ value: 5, label: "a" }, { value: 2, label: "b" }] })).toBeNull();
    expect(normalizeTracker({ ...levelTracker, levels: [{ value: 50, label: "a" }] })).toBeNull();
    expect(normalizeTracker({ ...levelTracker, levels: [] })).toBeNull();
    expect(normalizeTracker({ ...levelTracker, type: "bar" })).toBeNull();
  });

  it("accepts points trackers without levels", () => {
    const t = normalizeTracker({ label: "Corruption", type: "points", min: 0, max: 10, levels: [{ value: 1 }] });
    expect(t?.levels).toBeUndefined();
  });
});

describe("normalizeTracker — limits", () => {
  const points = { label: "Dread", type: "points", min: 0, max: 10 };
  const level = (value: number, label = `L${value}`) => ({ value, label });
  const withLevels = (levels: unknown[], over: Record<string, unknown> = {}) =>
    normalizeTracker({ label: "Dread", type: "level", min: 0, max: 10, levels, ...over });
  const effectsOf = (effects: unknown[]) =>
    normalizeTracker({ ...points, type: "level", levels: [{ value: 0, label: "Calm", effects }] })?.levels?.[0].effects;

  it("allows eight levels and no more", () => {
    expect(withLevels(Array.from({ length: 8 }, (_, i) => level(i)))?.levels).toHaveLength(8);
    expect(withLevels(Array.from({ length: 9 }, (_, i) => level(i)))).toBeNull();
  });

  it("needs levels strictly rising, within the tracker's range at both ends", () => {
    expect(withLevels([level(3), level(3)])).toBeNull();
    expect(withLevels([level(0), level(10)])?.levels).toHaveLength(2);
    expect(withLevels([level(-1)])).toBeNull();
    expect(withLevels([level(11)])).toBeNull();
    expect(withLevels([level(2)], { levels: undefined })).toBeNull();
  });

  it("needs a range that actually spans something", () => {
    expect(normalizeTracker({ ...points, min: 5, max: 5 })).toBeNull();
    expect(normalizeTracker({ ...points, min: 4, max: 5 })).not.toBeNull();
  });

  it("accepts a start on either end of the range and refuses one outside it", () => {
    expect(normalizeTracker({ ...points, min: 2, start: 2 })?.start).toBe(2);
    expect(normalizeTracker({ ...points, start: 10 })?.start).toBe(10);
    expect(normalizeTracker({ ...points, min: 2, start: 1 })).toBeNull();
    expect(normalizeTracker({ ...points, start: 11 })).toBeNull();
    expect(normalizeTracker({ ...points, start: 1.5 })).toBeNull();
  });

  it("keeps an exhaustion effect from 1 to 6, a save DC from 0 to 30, and a speed only with a whole number", () => {
    const exhaustion = (value: number) => ({ type: "exhaustion", label: "Tired", value });
    expect(effectsOf([exhaustion(0), exhaustion(1), exhaustion(6), exhaustion(7)])?.map((e) => e.value)).toEqual([1, 6]);
    const save = (dcBase: number) => ({ type: "save", label: "Fear", ability: "WIS", dcBase });
    expect(effectsOf([save(-1), save(0), save(30), save(31)])?.map((e) => e.dcBase)).toEqual([0, 30]);
    const speed = (value: unknown) => ({ type: "speed", label: "Slow", value });
    expect(effectsOf([speed("fast"), speed(1.5), speed(-10)])?.map((e) => e.value)).toEqual([-10]);
  });

  it("marks a save as adding the tracker only when the model says true", () => {
    const save = { type: "save", label: "Fear", ability: "WIS", dcBase: 10 };
    expect(effectsOf([save])?.[0]).not.toHaveProperty("dcAddTracker");
    expect(effectsOf([{ ...save, dcAddTracker: "yes" }])?.[0]).not.toHaveProperty("dcAddTracker");
  });

  it("keeps only real abilities in a disadvantage scope, and no scope when none is real", () => {
    const dis = (scope: string) => ({ type: "disadvantage_checks", label: "Shaky", scope });
    expect(effectsOf([dis("str, wis, luck")])?.[0].scope).toBe("STR,WIS");
    expect(effectsOf([dis("luck")])?.[0]).not.toHaveProperty("scope");
  });

  it("allows six buttons, drops a delta of zero, and makes a button player-visible only when told", () => {
    const delta = (n: number) => ({ label: `+${n}`, delta: n, ...(n === 1 ? { playerVisible: true } : {}) });
    const buttons = normalizeTracker({ ...points, dmButtons: [delta(0), ...[1, 2, 3, 4, 5, 6, 7].map(delta)] })?.dmButtons;
    // The zero is dropped; the cap of six is taken from the raw list, so five of the rest survive.
    expect(buttons?.map((b) => b.delta)).toEqual([1, 2, 3, 4, 5]);
    expect(buttons?.map((b) => b.playerVisible)).toEqual([true, false, false, false, false]);
    const setButtons = normalizeTracker({ ...points, dmButtons: [{ label: "Calm", mode: "set", setValue: 0 }, { label: "Max", mode: "set", setValue: 10 }, { label: "Over", mode: "set", setValue: 11 }, { label: "Under", mode: "set", setValue: -1 }] })?.dmButtons;
    expect(setButtons?.map((b) => b.setValue)).toEqual([0, 10]);
    expect(setButtons?.map((b) => b.playerVisible)).toEqual([false, false]);
  });

  it("keeps a rest trigger of zero, drops an item tag with no delta, and leaves no triggers when nothing is valid", () => {
    expect(normalizeTracker({ ...points, triggers: { onShortRest: 0 } })?.triggers).toEqual({ onShortRest: 0 });
    expect(normalizeTracker({ ...points, triggers: { itemTags: [{ tag: "x", mode: "on_consume" }] } })).not.toHaveProperty("triggers");
    expect(normalizeTracker({ ...points, triggers: {} })).not.toHaveProperty("triggers");
  });
});
