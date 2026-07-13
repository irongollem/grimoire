import { describe, it, expect } from "vitest";
import { drawFromDeck, nextPreppedBack, pickWeightedSeed } from "./downtimeDeck";
import type { DowntimeDeckBack, DowntimeSeed } from "@/types/downtime.types";

const ISO = "2026-07-10T00:00:00.000Z";

function back(over: Partial<DowntimeDeckBack> = {}): DowntimeDeckBack {
  return {
    id: crypto.randomUUID(),
    campaign_id: "c1",
    activity_key: "carouse",
    reward_type: "npc",
    reward_id: crypto.randomUUID(),
    is_recurring: false,
    position: 0,
    consumed_at: null,
    created_at: ISO,
    updated_at: ISO,
    ...over,
  };
}

function seed(over: Partial<DowntimeSeed> = {}): DowntimeSeed {
  return {
    id: "seed-a",
    activityKey: "carouse",
    weight: 1,
    title: "A title",
    vignette: "A vignette",
    proposedEffects: [],
    reward: {
      kind: "npc",
      npc: {
        name: "Someone",
        race: null,
        alignment: null,
        occupation: null,
        appearance: null,
        personality: null,
        backstory: null,
        relationship: "indifferent",
        tags: [],
        portrait_url: null,
      },
    },
    ...over,
  };
}

/** A deterministic rng that replays a queued sequence of values in [0, 1). */
function rngOf(...values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("rng called more times than queued");
    return values[i++];
  };
}

describe("nextPreppedBack", () => {
  it("returns null when the pile is empty", () => {
    expect(nextPreppedBack("carouse", [])).toBeNull();
  });

  it("takes the lowest position first (FIFO)", () => {
    const second = back({ position: 2 });
    const first = back({ position: 1 });
    expect(nextPreppedBack("carouse", [second, first])?.id).toBe(first.id);
  });

  it("breaks position ties on created_at so the order is total", () => {
    const later = back({ position: 0, created_at: "2026-07-10T12:00:00.000Z" });
    const earlier = back({ position: 0, created_at: "2026-07-10T06:00:00.000Z" });
    expect(nextPreppedBack("carouse", [later, earlier])?.id).toBe(earlier.id);
  });

  it("ignores consumed backs", () => {
    const consumed = back({ position: 1, consumed_at: ISO });
    const live = back({ position: 2 });
    expect(nextPreppedBack("carouse", [consumed, live])?.id).toBe(live.id);
  });

  it("ignores backs prepped for a different archetype", () => {
    const other = back({ position: 1, activity_key: "craft" });
    const mine = back({ position: 5 });
    expect(nextPreppedBack("carouse", [other, mine])?.id).toBe(mine.id);
  });

  it("returns null when every back for this archetype is consumed", () => {
    expect(nextPreppedBack("carouse", [back({ consumed_at: ISO })])).toBeNull();
  });

  it("does not mutate the caller's array", () => {
    const b1 = back({ position: 2 });
    const b2 = back({ position: 1 });
    const pile = [b1, b2];
    nextPreppedBack("carouse", pile);
    expect(pile[0].id).toBe(b1.id);
  });
});

describe("pickWeightedSeed", () => {
  it("returns null when no seed matches the archetype", () => {
    expect(pickWeightedSeed("carouse", [seed({ activityKey: "craft" })], rngOf(0))).toBeNull();
  });

  it("returns null when every matching seed has non-positive weight", () => {
    const dead = [seed({ id: "a", weight: 0 }), seed({ id: "b", weight: -3 })];
    expect(pickWeightedSeed("carouse", dead, rngOf(0.5))).toBeNull();
  });

  it("respects weight bands", () => {
    // weights 1 and 3 → total 4. Band A is [0,1), band B is [1,4).
    const pool = [seed({ id: "a", weight: 1 }), seed({ id: "b", weight: 3 })];
    expect(pickWeightedSeed("carouse", pool, rngOf(0))?.id).toBe("a");
    expect(pickWeightedSeed("carouse", pool, rngOf(0.2))?.id).toBe("a"); // 0.8 < 1
    expect(pickWeightedSeed("carouse", pool, rngOf(0.25))?.id).toBe("b"); // 1.0 → band B
    expect(pickWeightedSeed("carouse", pool, rngOf(0.99))?.id).toBe("b");
  });

  it("excludes zero-weight seeds from the bands", () => {
    const pool = [seed({ id: "dead", weight: 0 }), seed({ id: "live", weight: 2 })];
    expect(pickWeightedSeed("carouse", pool, rngOf(0))?.id).toBe("live");
    expect(pickWeightedSeed("carouse", pool, rngOf(0.99))?.id).toBe("live");
  });

  it("falls back to the last band rather than null if rng returns 1", () => {
    const pool = [seed({ id: "a", weight: 1 }), seed({ id: "b", weight: 1 })];
    expect(pickWeightedSeed("carouse", pool, rngOf(1))?.id).toBe("b");
  });
});

describe("drawFromDeck", () => {
  it("prefers a prepped back over a seed", () => {
    const prepped = back();
    const result = drawFromDeck("carouse", [prepped], [seed()], rngOf(0));
    expect(result).toEqual({ source: "prepped", back: prepped });
  });

  it("falls back to a seed when the prep pile is empty", () => {
    const s = seed({ id: "only" });
    const result = drawFromDeck("carouse", [], [s], rngOf(0));
    expect(result).toEqual({ source: "seed", seed: s });
  });

  it("falls back to a seed when every prepped back is consumed", () => {
    const result = drawFromDeck("carouse", [back({ consumed_at: ISO })], [seed()], rngOf(0));
    expect(result?.source).toBe("seed");
  });

  it("does not consume the back itself — that is the caller's job", () => {
    const prepped = back();
    drawFromDeck("carouse", [prepped], [seed()], rngOf(0));
    expect(prepped.consumed_at).toBeNull();
  });

  it("keeps returning a recurring back, since it is never consumed", () => {
    const recurring = back({ is_recurring: true });
    for (let i = 0; i < 3; i++) {
      const result = drawFromDeck("carouse", [recurring], [seed()], rngOf(0));
      expect(result).toEqual({ source: "prepped", back: recurring });
    }
  });

  it("returns null when the deck has nothing to give", () => {
    expect(drawFromDeck("carouse", [], [], rngOf(0))).toBeNull();
  });

  it("returns null when nothing matches this archetype", () => {
    const otherBack = back({ activity_key: "craft" });
    const otherSeed = seed({ activityKey: "craft" });
    expect(drawFromDeck("carouse", [otherBack], [otherSeed], rngOf(0))).toBeNull();
  });

  it("never calls rng when a prepped back wins", () => {
    const exploding = () => {
      throw new Error("rng must not be called");
    };
    const result = drawFromDeck("carouse", [back()], [seed()], exploding);
    expect(result).not.toBeNull();
    expect(result?.source).toBe("prepped");
  });
});
