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
