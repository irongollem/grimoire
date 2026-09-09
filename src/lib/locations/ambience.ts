import type { Location } from "@/types/location.types";
import { isSilenceTheme } from "@/lib/audio/audioThemes";

/**
 * The inheritance rule (epic #868, story S7 — "a room that sounds like
 * itself"). `audio_theme` null means "ask my parent", not "no audio": before
 * this, `resolvePartyAmbience` treated a themeless room as a release, so a
 * dungeon themed once at the site went silent the moment the party stepped
 * into any room beneath it — theming seven rooms was seven trips through the
 * edit form. Now null walks `parent_id` up to the nearest ancestor with a
 * theme, and the reserved label `SILENCE_THEME` is authorable silence: a
 * DM can say "this room is deliberately quiet" without that reading as "not
 * decided yet".
 *
 * Pure and Vue-free on purpose, like `lib/locations/tree.ts` beside it: this
 * is exercised by both `usePartyAmbience` (session ambience) and
 * `LocationSheet` (prep-time preview), and a Vue-coupled version would force
 * either caller to fake reactivity in tests that have nothing to do with it.
 */

export type AmbienceLocationLike = Pick<Location, "id" | "parent_id" | "audio_theme" | "name">;

export type AmbienceKind = "own" | "inherited" | "silence" | "none";

export interface ResolvedAmbience {
  /** What to actually request, or null when nothing should play. */
  theme: string | null;
  /**
   * The location whose own `audio_theme` produced this answer — itself for
   * "own", the ancestor for "inherited", wherever the silence was authored
   * for "silence", and null for "none".
   *
   * Callers should key their producer `sourceId` on *this* id, not the id of
   * the location actually asked about: that is what makes walking between
   * two rooms that inherit from the same ancestor a no-op for the ambient
   * slot instead of a request-then-release that briefly holds two owners on
   * one scene — see `usePartyAmbience`'s header comment for the trigger-bus
   * behaviour that makes this load-bearing rather than cosmetic.
   */
  from: AmbienceLocationLike | null;
  kind: AmbienceKind;
}

const NONE: ResolvedAmbience = { theme: null, from: null, kind: "none" };

/**
 * Walks `parent_id` from `locationId` toward the root, stopping at the first
 * location with a non-blank `audio_theme` — silence included, since silence
 * is itself an authored answer and must stop the walk exactly like a real
 * theme would (a silent site under a themed continent stays silent, it does
 * not skip past itself to inherit from further up).
 *
 * Cycle-guarded the same way `lib/locations/tree.ts`'s `ancestorPath` is: the
 * schema permits a `parent_id` loop, and a lookup that spins forever on one
 * is worse than one that gives up and answers "none".
 */
export function resolveInheritedTheme(
  locationId: string,
  byId: ReadonlyMap<string, AmbienceLocationLike>,
): ResolvedAmbience {
  const seen = new Set<string>();
  let current = byId.get(locationId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const theme = current.audio_theme;
    if (theme) {
      if (isSilenceTheme(theme)) return { theme: null, from: current, kind: "silence" };
      return { theme, from: current, kind: current.id === locationId ? "own" : "inherited" };
    }
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return NONE;
}
