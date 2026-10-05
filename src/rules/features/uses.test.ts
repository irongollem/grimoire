import { describe, expect, it } from "vitest";
import type { ResourcePool, StoredClassResources } from "./characterFeatures";
import { canPay, payCost, remainingUses, restoreUses, withToggle } from "./uses";

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
  it("spends from the pool and keeps the pool's recharge and short-rest regain", () => {
    const after = payCost({}, pools, { key: "channel_divinity", amount: 1 });
    expect(after.channel_divinity).toEqual({ current: 2, max: 3, rest: "long", short_rest_regain: 1 });
  });

  it("Empty Body cannot spend 4 Ki from 2", () => {
    const stored: StoredClassResources = { ki_points: { current: 2, max: 5, rest: "short" } };
    expect(canPay(stored, pools, { key: "ki_points", amount: 4 })).toBe(false);
    expect(() => payCost(stored, pools, { key: "ki_points", amount: 4 })).toThrow("Not enough Ki left");
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

describe("withToggle", () => {
  it("stores a toggle as <key>_active", () => {
    expect(withToggle({ fighting_style: "Defense" }, "rage", true)).toEqual({ fighting_style: "Defense", rage_active: true });
  });
});
