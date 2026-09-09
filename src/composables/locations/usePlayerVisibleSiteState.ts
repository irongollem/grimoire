import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useUiStore } from "@/stores/ui";
import type { CellKey } from "@/types/dungeonMap.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import type { ZoneKind } from "@/types/locationMapRegion.types";

const QUERY_KEY = "player-visible-site-state";

/**
 * One explored room in the composed plan — the party's own cells, name and
 * the cleared/looted facts they established. A room can appear as more than
 * one entry when the DM traced it as several shapes; `exploredRooms` below
 * folds those back into one list entry, but `PlayerSitePlan` still paints
 * every entry's cells.
 */
export interface PlayerSitePlanSpace {
  space_location_id: string;
  name: string;
  cells: CellKey[];
  label: string | null;
  sort_order: number | null;
  is_cleared: boolean;
  is_looted: boolean;
}

/** A footprint the party has not stood in but knows exists — "a room, that
 *  way." No id, no name, no contents: there is nothing else honest to send. */
export interface PlayerSitePlanGlimpse {
  cells: CellKey[];
}

/** A door the party has stood beside. `from_space_id`/`to_space_id` are sent
 *  only for the endpoint(s) that are themselves explored — a way into the
 *  unknown ends at its edge, not at a room id nobody has seen. */
export interface PlayerSitePlanWay {
  from_space_id: string | null;
  to_space_id: string | null;
  door_kind: DoorKind;
  source_edge_key: SourceEdgeKey | null;
}

/** A DM-marked zone, already clipped to explored cells by the RPC — this
 *  type never carries the part of a zone the party hasn't reached. */
export interface PlayerSitePlanZone {
  zone_kind: ZoneKind;
  label: string | null;
  cells: CellKey[];
}

/**
 * The composed player plan of one site (migration
 * `20260908215645_the_player_plan_is_composed_not_masked.sql`, epic #868
 * story S9). Everything the player's map may be drawn from, and nothing
 * else — no unexplored geometry, no secret ways out, no lock notes, no
 * baked image. `parsePlayerSitePlan` below is the only place that trusts the
 * RPC's shape; `PlayerSitePlan.vue` never touches `data` directly.
 */
export interface PlayerSitePlan {
  spaces: PlayerSitePlanSpace[];
  glimpsed: PlayerSitePlanGlimpse[];
  ways: PlayerSitePlanWay[];
  zones: PlayerSitePlanZone[];
}

/**
 * Validates that the RPC's jsonb document has the four arrays the plan is
 * built from, and throws rather than quietly downgrading to an empty plan
 * on anything else — an empty plan and "the RPC returned garbage" must not
 * look the same to a caller. Stops at "the arrays exist": the RPC's own
 * `jsonb_build_object` is the contract for what is inside them, and this
 * function's job is to catch a reshape of that contract, not to re-validate
 * every field it already types.
 */
export function parsePlayerSitePlan(data: unknown): PlayerSitePlan {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).spaces) ||
    !Array.isArray((data as Record<string, unknown>).glimpsed) ||
    !Array.isArray((data as Record<string, unknown>).ways) ||
    !Array.isArray((data as Record<string, unknown>).zones)
  ) {
    throw new Error("get_player_visible_site_state returned an unexpected shape");
  }
  const doc = data as {
    spaces: unknown[];
    glimpsed: unknown[];
    ways: unknown[];
    zones: unknown[];
  };
  return {
    spaces: doc.spaces as PlayerSitePlanSpace[],
    glimpsed: doc.glimpsed as PlayerSitePlanGlimpse[],
    ways: doc.ways as PlayerSitePlanWay[],
    zones: doc.zones as PlayerSitePlanZone[],
  };
}

async function fetchPlayerSitePlan(
  siteLocationId: string,
  previewPartyMemberId: string | null,
): Promise<PlayerSitePlan> {
  const { data, error } = await supabase.rpc("get_player_visible_site_state", {
    p_site_location_id: siteLocationId,
    p_preview_party_member_id: previewPartyMemberId,
  });
  if (error) throw error;
  return parsePlayerSitePlan(data);
}

/**
 * The party's own composed plan of a site. Players have no RLS path to
 * `location_map_regions`, `location_doors` or `location_state` at all —
 * this `SECURITY DEFINER` projection is the only way to read any of them,
 * the same shape as `useSharedLocations`'s `get_player_visible_locations`.
 *
 * `previewPartyMemberId` mirrors `usePlayerQuestBeats`'s own parameter, the
 * existing DM-preview mechanism — not a second one invented for this widget.
 * Pass an explicit ref to preview a specific character regardless of global
 * state; omit it and a DM's own `ui.dmPreviewMode` is read instead, so
 * `/play/quests/:id` keeps showing the composed plan once a DM has entered
 * preview via "Open actual player route". Without this fallback the RPC
 * would see the DM's own `campaign_members` row, whose `party_member_id` is
 * null and so matches nothing in `player_visible_to` — an empty plan for the
 * one person who needs to check what the plan shows.
 */
export function usePlayerVisibleSiteState(
  siteLocationId: string | Ref<string>,
  previewPartyMemberId?: Ref<string | null>,
) {
  const idRef = isRef(siteLocationId) ? siteLocationId : ref(siteLocationId);
  const ui = useUiStore();
  const previewId = computed(() => previewPartyMemberId?.value ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value, previewId.value]),
    queryFn: () => fetchPlayerSitePlan(idRef.value, previewId.value),
    enabled: () => !!idRef.value,
  });
}

/** One explored room, folded from however many shapes the DM traced for it. */
export interface ExploredRoom {
  spaceLocationId: string;
  name: string;
  isCleared: boolean;
  isLooted: boolean;
}

/**
 * De-duplicates `plan.spaces` by `space_location_id` — a room traced as two
 * or three shapes must still read as one room in a list — and orders them
 * the way the DM arranged the site's rooms (`sort_order`, nulls last, then
 * name, matching `SiteRoomsPanel`'s own ordering).
 */
export function exploredRooms(plan: PlayerSitePlan): ExploredRoom[] {
  const bySpace = new Map<string, PlayerSitePlanSpace>();
  for (const space of plan.spaces) {
    if (!bySpace.has(space.space_location_id)) bySpace.set(space.space_location_id, space);
  }
  return [...bySpace.values()]
    .sort((a, b) => {
      const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.name.localeCompare(b.name);
    })
    .map((space) => ({
      spaceLocationId: space.space_location_id,
      name: space.name,
      isCleared: space.is_cleared,
      isLooted: space.is_looted,
    }));
}

/** "N ways on" in the header chip — the plan's own count, not a re-derivation
 *  from the doors the DM authored. */
export function wayCount(plan: PlayerSitePlan): number {
  return plan.ways.length;
}
