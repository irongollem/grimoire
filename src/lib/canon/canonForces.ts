import type { CanonForceTick } from "@/types/canon.types";

/**
 * A force's clock, as a number: the sum of its ticks, never past its size or below nothing. The ticks keep whatever
 * was written. Pure and in `lib` because the Canon page, the quest and faction pages and Tonight all read it, and a
 * `lib` module may not reach into a composable for it.
 */
export function clockFilled(ticks: readonly Pick<CanonForceTick, "delta">[], size: number): number {
  const sum = ticks.reduce((total, t) => total + t.delta, 0);
  return Math.min(size, Math.max(0, sum));
}

/**
 * The one quiet line for a force whose clock and steps disagree (#1258 item 11): a full clock with steps still unreached,
 * or every step reached with the clock short of full. A force with no clock or no steps has nothing to disagree with.
 * The clock and the steps are two ways of saying how far the force has come; they are not bound to each other, so this
 * only says when they have drifted apart.
 */
export function clockStepsDivergence(size: number | null, filled: number, steps: readonly { reached_at: string | null }[]): string | null {
  if (size === null || steps.length === 0) return null;
  const unreached = steps.filter((s) => s.reached_at === null).length;
  if (filled >= size && unreached > 0) return `The clock is full with ${unreached} ${unreached === 1 ? "step" : "steps"} unreached.`;
  if (unreached === 0 && filled < size) return `Every step is reached; the clock stands at ${filled} of ${size}.`;
  return null;
}

/**
 * The faction behind each force, by the faction's name as it is now (#1258 item 16). A force's title is its plan, so the
 * faction is read from the `about` link and its row, never from a copy of the name. A force with no link, or one whose
 * faction is gone, has none; if it has several, the first link in the order given wins.
 */
export function forceWhoNames(links: readonly { force_id: string; faction_id: string }[], factions: readonly { id: string; name: string }[]): Map<string, { id: string; name: string }> {
  const byId = new Map(factions.map((f) => [f.id, f.name] as const));
  const who = new Map<string, { id: string; name: string }>();
  for (const link of links) {
    const name = byId.get(link.faction_id);
    if (name !== undefined && !who.has(link.force_id)) who.set(link.force_id, { id: link.faction_id, name });
  }
  return who;
}
