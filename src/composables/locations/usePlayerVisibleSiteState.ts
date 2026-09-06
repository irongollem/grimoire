import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useUiStore } from "@/stores/ui";
import type { CellKey } from "@/types/dungeonMap.types";

const QUERY_KEY = "player-visible-site-state";

/**
 * One traced shape inside a site the party has explored — a row of the
 * `get_player_visible_site_state` projection (migration `20260906131403`,
 * story #798). Shaped like `LocationMapRegion` joined to its space, but
 * deliberately narrower: no `id`/`user_id`/`site_location_id`, because a
 * player never edits, binds or deletes a shape, only sees it. A room can
 * appear as more than one row when the DM traced it as several shapes —
 * `groupExploredRooms` below folds those back into one entry for a list; the
 * map overlay still paints every row's cells.
 *
 * Unexplored rooms are absent from the result entirely, by the RPC's own
 * design — the map fills in as the party goes, it never arrives complete.
 */
export interface PlayerVisibleSiteRoom {
  space_location_id: string;
  name: string;
  cells: CellKey[];
  label: string | null;
  sort_order: number | null;
  is_cleared: boolean;
  is_looted: boolean;
}

async function fetchPlayerVisibleSiteState(
  siteLocationId: string,
  previewPartyMemberId: string | null,
): Promise<PlayerVisibleSiteRoom[]> {
  const { data, error } = await supabase.rpc("get_player_visible_site_state", {
    p_site_location_id: siteLocationId,
    p_preview_party_member_id: previewPartyMemberId,
  });
  if (error) throw error;
  return (data ?? []) as PlayerVisibleSiteRoom[];
}

/**
 * The party's own record of a site: only the rooms they have explored, with
 * the cleared/looted facts they themselves established. Players have no RLS
 * path to `location_map_regions` or `location_state` at all — this
 * `SECURITY DEFINER` projection is the only way to read either, the same
 * shape as `useSharedLocations`'s `get_player_visible_locations`.
 *
 * `previewPartyMemberId` mirrors `usePlayerQuestBeats`'s own parameter, the
 * existing DM-preview mechanism — not a second one invented for this widget.
 * Pass an explicit ref to preview a specific character regardless of global
 * state; omit it and a DM's own `ui.dmPreviewMode` is read instead, so
 * `/play/quests/:id` keeps showing explored rooms once a DM has entered
 * preview via "Open actual player route". Without this fallback the RPC
 * would see the DM's own `campaign_members` row, whose `party_member_id` is
 * null and so matches nothing in `player_visible_to` — an empty room list
 * for the one person who needs to check what the room list shows.
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
    queryFn: () => fetchPlayerVisibleSiteState(idRef.value, previewId.value),
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
 * De-duplicates `PlayerVisibleSiteRoom` rows by `space_location_id` — a room
 * traced as two or three shapes must still read as one room in a list — and
 * orders them the way the DM arranged the site's rooms (`sort_order`, nulls
 * last, then name, matching `SiteRoomsPanel`'s own ordering).
 */
export function groupExploredRooms(rows: readonly PlayerVisibleSiteRoom[]): ExploredRoom[] {
  const bySpace = new Map<string, PlayerVisibleSiteRoom>();
  for (const row of rows) {
    if (!bySpace.has(row.space_location_id)) bySpace.set(row.space_location_id, row);
  }
  return [...bySpace.values()]
    .sort((a, b) => {
      const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.name.localeCompare(b.name);
    })
    .map((row) => ({
      spaceLocationId: row.space_location_id,
      name: row.name,
      isCleared: row.is_cleared,
      isLooted: row.is_looted,
    }));
}
