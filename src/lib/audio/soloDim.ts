import type { AudioEngine } from "@/lib/audio/audioEngine";
import { isLoopShadowId } from "@/lib/audio/soundTransport";

/** Solo: everything outside the set sits at this fraction of its level. */
export const SOLO_DIM = 0.25;
const SOLO_RAMP_MS = 250;

/** Logical sound id of a gapless pair's shadow half (the id itself for anything else). */
export function logicalSoundId(id: string): string {
  return isLoopShadowId(id) ? id.slice(0, -6) : id;
}

interface Cell<T> {
  value: T;
}

export interface SoloDeps {
  engine: Pick<AudioEngine, "setSoundDim">;
  /** The reactive home of the soloed ids; the store exposes it read-only. */
  ids: Cell<readonly string[] | null>;
  /** Is this id audible right now (a playing sound, or a layer of a running scene)? */
  isAlive: (id: string) => boolean;
  /** Every id solo may need to touch: sounds, scene layers and gapless shadows. */
  knownIds: () => Iterable<string>;
}

/** Solo: keep a set of sounds at full level and dim the rest, clearing itself once they are done. */
export function createSolo(deps: SoloDeps) {
  const { engine, ids, isAlive, knownIds } = deps;
  /** True once a soloed sound has actually been heard, so a solo set before its sound starts is not cleared early. */
  let seen = false;

  function dimFor(id: string): number {
    const solo = ids.value;
    if (solo === null) return 1;
    return solo.includes(logicalSoundId(id)) ? 1 : SOLO_DIM;
  }

  function applyDim(id: string, rampMs: number): void {
    engine.setSoundDim(id, dimFor(id), rampMs);
  }

  function noteStart(id: string): void {
    const solo = ids.value;
    if (solo !== null && solo.includes(logicalSoundId(id))) seen = true;
  }

  /**
   * Keep only these sounds at full level; everything else audible dims to 25%.
   * `null` (or an empty list) restores everything. Sounds that start later are
   * dimmed too, unless they are in the set.
   */
  function setSolo(next: readonly string[] | null): void {
    const list = next !== null && next.length > 0 ? [...next] : null;
    if (list === null && ids.value === null) return;
    ids.value = list;
    seen = list !== null && list.some(isAlive);
    for (const id of knownIds()) applyDim(id, SOLO_RAMP_MS);
  }

  /** Clear solo once every soloed sound has stopped, so the rest is not left dimmed for good. */
  function checkAlive(): void {
    const solo = ids.value;
    if (solo === null || !seen) return;
    if (!solo.some(isAlive)) setSolo(null);
  }

  return { dimFor, applyDim, noteStart, setSolo, checkAlive };
}
