import { computed } from "vue";
import { useWorldTies } from "@/composables/world/useWorldTies";
import type { WorldTie } from "@/lib/worldWeb/ties";
import type { WebKind } from "@/lib/worldWeb/kinds";

/** One person or faction that knows a truth. */
export interface Knower {
  rowId: string;
  kind: WebKind;
  id: string;
  name: string;
}

/** Who knows each canon entry, from the campaign's ties: `known_to` links running from the entry out, by entry id. */
export function knowersByEntry(ties: readonly WorldTie[]): Map<string, Knower[]> {
  const byEntry = new Map<string, Knower[]>();
  for (const tie of ties) {
    if (tie.source !== "link" || tie.type !== "known_to" || tie.from_kind !== "canon") continue;
    const list = byEntry.get(tie.from_id) ?? [];
    list.push({ rowId: tie.row_id, kind: tie.to_kind, id: tie.to_id, name: tie.to_name });
    byEntry.set(tie.from_id, list);
  }
  return byEntry;
}

/** Everyone who knows every truth, in the one read the World web already makes (refreshed by the connections ring). */
export function useKnowersByEntry() {
  const { data, isLoading } = useWorldTies();
  const byEntry = computed(() => knowersByEntry(data.value ?? []));
  return { byEntry, isLoading };
}
