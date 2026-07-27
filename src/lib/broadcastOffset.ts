import type { SoundboardBroadcast } from "@/types/sound.types";

/**
 * Where a player should be in the DM's track, right now.
 *
 * The DM pushes an **anchor** — the wall-clock instant corresponding to
 * position zero — rather than a position, because a position is already stale
 * by the time it crosses the wire and would need re-sending several times a
 * second to stay useful. From an anchor every client derives its own offset and
 * a player joining thirty seconds late lands in the right place with no extra
 * traffic at all.
 *
 * Pure and separately tested because it is the one piece here that is quietly
 * wrong rather than loudly broken when it is wrong.
 */

/** Past this much drift, seek rather than let it ride — smaller gaps are inaudible. */
export const RESYNC_THRESHOLD_S = 3;

export function broadcastOffsetSeconds(
  row: Pick<SoundboardBroadcast, "started_at" | "is_paused" | "paused_at">,
  now: number,
): number {
  if (row.started_at === null) return 0;
  const startedAt = Date.parse(row.started_at);
  if (Number.isNaN(startedAt)) return 0;

  // A paused broadcast froze at paused_at; a live one keeps running. Without
  // this a player who joins during a pause lands wherever the clock has drifted
  // to, which after a five-minute break is well past the end of the track.
  let at = now;
  if (row.is_paused && row.paused_at !== null) {
    const pausedAt = Date.parse(row.paused_at);
    if (!Number.isNaN(pausedAt)) at = pausedAt;
  }

  return Math.max(0, (at - startedAt) / 1000);
}

/** Should the element be nudged, or is it close enough to leave alone? */
export function shouldResync(currentTime: number, target: number): boolean {
  return Math.abs(currentTime - target) > RESYNC_THRESHOLD_S;
}
