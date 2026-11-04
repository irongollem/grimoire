import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { usePartySenses } from "@/composables/party/usePartySenses";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import type { DarknessZone } from "@/lib/battlemap/illumination";
import { sightCells, sightScene, type MapGrid } from "@/lib/battlemap/partySight";
import type { SizedToken } from "@/lib/battlemap/tokenFootprint";
import { partyViewers, type Viewer } from "@/lib/battlemap/vision";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

export interface SightToken extends SizedToken {
  instance_id: string;
  type: string;
  party_member_id?: string | null;
  position?: { x: number; y: number } | null;
}

// Tokens arrive as a fresh array on every drag; sight changes only when a viewer moves or its range does, so an equal
// set keeps the previous array and the vision grid is not rebuilt for a monster that moved.
const sameViewers = (a: readonly Viewer[], b: readonly Viewer[]) =>
  a.length === b.length &&
  a.every(
    (v, i) =>
      v.x === b[i].x &&
      v.y === b[i].y &&
      v.darkvisionFeet === b[i].darkvisionFeet &&
      v.blindsightFeet === b[i].blindsightFeet &&
      v.truesightFeet === b[i].truesightFeet &&
      v.devilsSightFeet === b[i].devilsSightFeet,
  );

/** The squares the party sees right now, and the viewers they are seen from (epic #1133). */
export function usePartySight(opts: {
  live: MaybeRefOrGetter<MapLive | null>;
  doorStates: MaybeRefOrGetter<readonly MapLiveDoorState[]>;
  zones: MaybeRefOrGetter<readonly DarknessZone[]>;
  tokens: MaybeRefOrGetter<readonly SightToken[]>;
  grid: MaybeRefOrGetter<MapGrid | null>;
  /** When set, only this token looks: a phone in "each their own" sight. */
  onlyInstanceId?: MaybeRefOrGetter<string | null>;
}): { viewers: ComputedRef<Viewer[]>; sight: ComputedRef<Set<FogCellKey>> } {
  const sensesOf = usePartySenses();
  const viewers = computed<Viewer[]>((prev) => {
    const only = opts.onlyInstanceId ? toValue(opts.onlyInstanceId) : null;
    const all = toValue(opts.tokens);
    const tokens = only ? all.filter((t) => t.instance_id === only) : all;
    const next = partyViewers(tokens, (c) => sensesOf.value(c.party_member_id));
    return prev && sameViewers(prev, next) ? prev : next;
  });
  const sight = computed<Set<FogCellKey>>(() => {
    const grid = toValue(opts.grid);
    if (!grid) return new Set();
    return sightCells(sightScene(toValue(opts.live), toValue(opts.doorStates), toValue(opts.zones)), viewers.value, grid);
  });
  return { viewers, sight };
}
