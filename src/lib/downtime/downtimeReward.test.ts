import { describe, it, expect } from "vitest";
import {
  downtimeRewardHref,
  pendingRewardLabel,
  isResolvableRewardType,
  RESOLVABLE_REWARD_TYPES,
} from "./downtimeReward";
import { DOWNTIME_REWARD_TYPES } from "@/types/downtime.types";
import { DOWNTIME_SEEDS } from "@/data/downtimeSeeds";

describe("downtimeRewardHref", () => {
  it("sends an item to the Vault, not to /items", () => {
    // The whole reason this function exists: the route does not follow from the
    // noun, and a call site that guesses hands the reader a 404 on a link the
    // vignette promised was real.
    expect(downtimeRewardHref("item", "abc")).toBe("/vault/abc");
  });

  it("routes every reward kind somewhere", () => {
    for (const type of DOWNTIME_REWARD_TYPES) {
      expect(downtimeRewardHref(type, "abc")).toMatch(/^\/[a-z]+\/abc$/);
    }
  });
});

describe("pendingRewardLabel", () => {
  it("never claims the reward is gone", () => {
    // A hidden reward and a deleted one look identical to a player. Saying
    // "no longer exists" about the first is the lie this label exists to avoid.
    for (const type of DOWNTIME_REWARD_TYPES) {
      expect(pendingRewardLabel(type)).not.toMatch(/no longer|gone|missing|\?\?\?/i);
    }
  });

  it("stays voice-neutral, because the DM board renders it too", () => {
    // "your DM will introduce them" printed on the DM's own board is nonsense.
    for (const type of DOWNTIME_REWARD_TYPES) {
      expect(pendingRewardLabel(type)).not.toMatch(/\byour\b|\byou\b/i);
    }
  });

  it("names an item's absence as a handover rather than an introduction", () => {
    expect(pendingRewardLabel("item")).toBe("not yet handed over");
    expect(pendingRewardLabel("npc")).toBe("not yet introduced");
  });
});

describe("RESOLVABLE_REWARD_TYPES", () => {
  it("covers every kind a seed can actually mint", () => {
    // If a seed gains a reward kind the boards cannot resolve, that kind starts
    // rendering as an absence marker on a row that exists — which is exactly
    // how item rewards shipped broken. Fail here instead.
    const seeded = new Set(DOWNTIME_SEEDS.map((seed) => seed.reward.kind));
    for (const kind of seeded) {
      expect(isResolvableRewardType(kind)).toBe(true);
    }
  });

  it("is a subset of the reward vocabulary", () => {
    for (const type of RESOLVABLE_REWARD_TYPES) {
      expect(DOWNTIME_REWARD_TYPES).toContain(type);
    }
  });
});
