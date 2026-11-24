import { computed } from "vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useEntityPlacementsFor } from "@/composables/locations/useLocationPlacements";
import type { PlacedTable } from "@/lib/canon/habitats";

/**
 * The campaign's roll tables that are placed on a place in the Atlas, with their names (#1258 item 15). The reads are
 * the ones the journey line makes (`useRollTables`, then their placements in one query); empty while either loads.
 */
export function usePlacedTables(wanted: () => boolean = () => true) {
  const { data: tables } = useRollTables(wanted);
  const ids = computed(() => (tables.value ?? []).map((t) => t.id));
  const { data: placements } = useEntityPlacementsFor("roll_table", ids);
  return computed<PlacedTable[]>(() => {
    const names = new Map((tables.value ?? []).map((t) => [t.id, t.name]));
    return (placements.value ?? []).flatMap((p) => {
      const name = p.roll_table_id ? names.get(p.roll_table_id) : undefined;
      return p.roll_table_id && name !== undefined ? [{ id: p.roll_table_id, name, placeId: p.location_id }] : [];
    });
  });
}
