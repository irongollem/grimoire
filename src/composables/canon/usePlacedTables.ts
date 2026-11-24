import { computed, type ComputedRef } from "vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useEntityPlacementsFor } from "@/composables/locations/useLocationPlacements";
import type { PlacedTable } from "@/lib/canon/habitats";

/**
 * The campaign's roll tables that are placed on a place in the Atlas, with their names (#1258 item 15). The reads are
 * the ones the journey line makes (`useRollTables`, then their placements in one query); empty while either loads.
 */
export function usePlacedTables(wanted: () => boolean = () => true): ComputedRef<PlacedTable[]> {
  return usePlacedTablesState(wanted).tables;
}

/**
 * `usePlacedTables` plus `ready`: true once both reads have answered (or failed), so a caller that must not decide
 * from "no tables yet" (an encounter's habitat) can tell an empty answer from one still on its way.
 */
export function usePlacedTablesState(wanted: () => boolean = () => true): { tables: ComputedRef<PlacedTable[]>; ready: ComputedRef<boolean> } {
  const tablesQuery = useRollTables(wanted);
  const tableRows = tablesQuery.data;
  const ids = computed(() => (tableRows.value ?? []).map((t) => t.id));
  const placementsQuery = useEntityPlacementsFor("roll_table", ids);
  const placements = placementsQuery.data;
  const tables = computed<PlacedTable[]>(() => {
    const names = new Map((tableRows.value ?? []).map((t) => [t.id, t.name]));
    return (placements.value ?? []).flatMap((p) => {
      const name = p.roll_table_id ? names.get(p.roll_table_id) : undefined;
      return p.roll_table_id && name !== undefined ? [{ id: p.roll_table_id, name, placeId: p.location_id }] : [];
    });
  });
  const ready = computed(() => {
    if (!(tableRows.value !== undefined || tablesQuery.isError.value)) return false;
    // With no table there is nothing to place, and the placements read never starts.
    return ids.value.length === 0 || placements.value !== undefined || placementsQuery.isError.value;
  });
  return { tables, ready };
}
