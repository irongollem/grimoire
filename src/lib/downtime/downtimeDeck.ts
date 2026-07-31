import type {
  DowntimeDeckBack,
  DowntimeSeed,
  DrawResult,
} from "@/types/downtime.types";

/**
 * Resolve what a downtime draw yields, for one archetype.
 *
 * The rule, uniform across reward types:
 *   1. The DM's prepped backs are consumed first, in FIFO order.
 *   2. When the prep pile is empty, fall back to a weighted random system seed.
 *
 * So the same deck is simultaneously an on-the-fly content generator and a
 * delivery mechanism for prepped story — the DM chooses, per archetype, how much
 * to stack.
 *
 * `rng` is injected rather than calling `Math.random()` inline so the caller (and
 * the tests) control the roll. It must return a value in [0, 1).
 *
 * Returns null when the deck has nothing to give: no unconsumed prepped back and
 * no seed with positive weight. Callers must handle that explicitly rather than
 * coercing it to an empty result.
 */
export function drawFromDeck(
  activityKey: string,
  preppedBacks: readonly DowntimeDeckBack[],
  seeds: readonly DowntimeSeed[],
  rng: () => number,
): DrawResult | null {
  const back = nextPreppedBack(activityKey, preppedBacks);
  if (back) return { source: "prepped", back };

  const seed = pickWeightedSeed(activityKey, seeds, rng);
  if (seed) return { source: "seed", seed };

  return null;
}

/**
 * The next back off the pile: unconsumed, this archetype, lowest position.
 * Ties break on `created_at` so the order is total and stable.
 *
 * Recurring backs are never consumed, so a recurring back at the front of the
 * pile keeps winning — that is the point ("this fence is *always* who rogues
 * find in this city"). Callers stamp `consumed_at` only for one-shots.
 */
export function nextPreppedBack(
  activityKey: string,
  preppedBacks: readonly DowntimeDeckBack[],
): DowntimeDeckBack | null {
  const pile = preppedBacks
    .filter((b) => b.activity_key === activityKey && b.consumed_at === null)
    .sort(
      (a, b) =>
        a.position - b.position || a.created_at.localeCompare(b.created_at),
    );
  return pile.length > 0 ? pile[0] : null;
}

/**
 * Weighted pick across this archetype's seeds. Seeds with a non-positive weight
 * are unreachable by construction and excluded.
 */
export function pickWeightedSeed(
  activityKey: string,
  seeds: readonly DowntimeSeed[],
  rng: () => number,
): DowntimeSeed | null {
  const pool = seeds.filter((s) => s.activityKey === activityKey && s.weight > 0);
  if (pool.length === 0) return null;

  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  // rng() is in [0, 1), so `target` is in [0, total) and always lands in a band.
  const target = rng() * total;

  let cursor = 0;
  for (const seed of pool) {
    cursor += seed.weight;
    if (target < cursor) return seed;
  }

  // Unreachable for rng() in [0, 1). A caller passing rng() === 1 would fall
  // through; return the last band rather than null so the deck never lies about
  // being empty.
  return pool[pool.length - 1];
}
