import { describe, expect, it } from "vitest";
import type { ResourcePool, StoredClassResources } from "./characterFeatures";
import { canPay, payCost, unpayableReason, remainingUses, restoreUses, withToggle } from "./uses";

const ki: ResourcePool = {
  key: "ki_points", label: "Ki", max: 5, recharge: "short", shortRestRegain: null, pool: true, sources: ["Ki"],
};
const rage: ResourcePool = {
  key: "rage_uses", label: "Rage", max: "unlimited", recharge: "long", shortRestRegain: null, pool: false, sources: ["Rage"],
};
const channel: ResourcePool = {
  key: "channel_divinity", label: "Channel Divinity", max: 3, recharge: "long", shortRestRegain: 1, pool: false,
  sources: ["Channel Divinity"],
};
const pools = [ki, rage, channel];

describe("remainingUses", () => {
  it("reads the stored count, a full pool when nothing is stored yet, unlimited, and null for a pool the character lacks", () => {
    const stored: StoredClassResources = { ki_points: { current: 2, max: 5, rest: "short" } };
    expect(remainingUses(stored, pools, "ki_points")).toBe(2);
    expect(remainingUses({}, pools, "ki_points")).toBe(5);
    expect(remainingUses({}, pools, "rage_uses")).toBe("unlimited");
    expect(remainingUses({}, pools, "sorcery_points")).toBeNull();
  });
});

describe("payCost", () => {
  // PHB 2014 "Monk" Ki / Empty Body: a use costs ki points from the pool and cannot go below zero
  it("spends from the pool and keeps the pool's recharge and short-rest regain", () => {
    const after = payCost({}, pools, { key: "channel_divinity", amount: 1 });
    expect(after.channel_divinity).toEqual({ current: 2, max: 3, rest: "long", short_rest_regain: 1 });
  });

  it("Empty Body cannot spend 4 Ki from 2", () => {
    const stored: StoredClassResources = { ki_points: { current: 2, max: 5, rest: "short" } };
    expect(canPay(stored, pools, { key: "ki_points", amount: 4 })).toBe(false);
    expect(() => payCost(stored, pools, { key: "ki_points", amount: 4 })).toThrow("Not enough Ki left");
  });

  it("pays exactly what is left, one more is refused, and the amount is what leaves the pool", () => {
    const stored: StoredClassResources = { ki_points: { current: 4, max: 5, rest: "short" } };
    expect(canPay(stored, pools, { key: "ki_points", amount: 4 })).toBe(true);
    expect(canPay(stored, pools, { key: "ki_points", amount: 5 })).toBe(false);
    expect(payCost(stored, pools, { key: "ki_points", amount: 3 }).ki_points.current).toBe(1);
  });

  it("a pool nothing has been spent from yet is stored on the rest it recharges on", () => {
    expect(payCost({}, pools, { key: "ki_points", amount: 1 }).ki_points.rest).toBe("short");
    expect(payCost({}, pools, { key: "channel_divinity", amount: 1 }).channel_divinity.rest).toBe("long");
  });

  it("a feature that spends a pool the character lacks is unusable, not free", () => {
    expect(canPay({}, pools, { key: "bardic_inspiration", amount: 1 })).toBe(false);
  });

  it("an unlimited pool pays without writing anything", () => {
    const stored: StoredClassResources = {};
    expect(payCost(stored, pools, { key: "rage_uses", amount: 1 })).toBe(stored);
  });
});

describe("restoreUses", () => {
  it("never goes above the max", () => {
    const stored: StoredClassResources = { ki_points: { current: 4, max: 5, rest: "short" } };
    expect(restoreUses(stored, pools, "ki_points", 3).ki_points.current).toBe(5);
  });
});

describe("restoreUses adds back what was asked and only to a pool that holds a count", () => {
  it("adds the amount to the stored count", () => {
    expect(restoreUses({ ki_points: { current: 1, max: 5, rest: "short" } }, pools, "ki_points", 2).ki_points.current).toBe(3);
  });
  it("leaves the resources alone when nothing is stored for the key", () => {
    const stored: StoredClassResources = {};
    expect(restoreUses(stored, pools, "ki_points", 2)).toBe(stored);
  });
});

describe("withToggle", () => {
  it("stores a toggle as <key>_active", () => {
    expect(withToggle({ fighting_style: "Defense" }, "rage", true)).toEqual({ fighting_style: "Defense", rage_active: true });
  });
});

describe("unpayableReason", () => {
  it("says 'not available' for a pool the character lacks, never 'none left' (a level 6 cleric with no Channel Divinity pool)", () => {
    expect(unpayableReason(remainingUses({}, [ki], "channel_divinity"), "Channel Divinity")).toBe("Channel Divinity not available");
  });
  it("says 'none left' when the pool exists and is spent", () => {
    const spent: StoredClassResources = { channel_divinity: { current: 0, max: 3, rest: "short" } };
    expect(unpayableReason(remainingUses(spent, pools, "channel_divinity"), "Channel Divinity")).toBe("No Channel Divinity left");
  });
});
