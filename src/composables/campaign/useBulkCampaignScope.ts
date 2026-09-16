import { useMutation, useQueryClient, type UseMutationReturnType } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { chunkArray } from "@/lib/utils";

/**
 * Bulk re-scoping to the active campaign or to "every campaign" (#875) — the
 * same two states `CampaignScopeField` offers a single row, applied to however
 * many rows a list selection holds. Modelled on the app's only existing
 * batch-update precedent, `stampSettingSource`
 * (`src/lib/populateSetting/settingContent.ts:54-70`):
 * `supabase.from(table).update({...}).in("id", [...ids]).select("id")`.
 *
 * RLS on every one of these tables is `auth.uid() = user_id` for UPDATE
 * (verified in production), so a batched `.in("id", ids)` can never reach
 * another account's rows — it silently updates only the caller's — and
 * `.select("id")` reports exactly what moved.
 *
 * Deliberately does NOT queue embeddings on success: a scope change alters no
 * embeddable content, unlike `useUpdateItem`/`useUpdateMonster` etc, which
 * queue one because their update touches describable fields.
 */

/** Every table this tool can re-scope. Adding one is a line here plus its query key. */
export type BulkScopeTable =
  | "items"
  | "monsters"
  | "species"
  | "spells"
  | "traps"
  | "puzzle_rooms"
  | "loot_tables"
  | "roll_tables"
  | "npcs"
  | "factions";

/**
 * Each table's list-query key. Eight of the ten owning composables keep their
 * key module-private (`const QUERY_KEY = "<table>"` — `useItems.ts:24`,
 * `useMonsters.ts:19`, `useSpecies.ts:14`, `useSpells.ts:17`, `useTraps.ts:12`,
 * `usePuzzles.ts:13`, `useLootTables.ts:7`, `useRollTables.ts:8`); `useNpcs.ts:13`
 * follows the same `const QUERY_KEY = "npcs"` shape, while `useFactions.ts`
 * inlines the literal `"factions"` at every call site instead of naming a
 * constant — same key, no constant to point at. So these are copies, not
 * imports, and could in principle drift from them.
 *
 * Exporting the ten and importing them here was the alternative and is worse:
 * it would pull all ten feature composables into every page that can bulk
 * re-scope anything, so opening the Vault would load the bestiary, the codex
 * and Dungeon Craft. The convention those ten follow is that the key IS the
 * table name, which `useBulkCampaignScope.test.ts` asserts for all of them — so
 * a future key that departs from its table name has to be a deliberate edit
 * here rather than a silent mismatch.
 *
 * The blast radius if one ever did drift is a stale list, never a wrong write:
 * the update targets the table directly and only the invalidation reads this.
 */
export const BULK_SCOPE_QUERY_KEY: Record<BulkScopeTable, string> = {
  items: "items",
  monsters: "monsters",
  species: "species",
  spells: "spells",
  traps: "traps",
  puzzle_rooms: "puzzle_rooms",
  loot_tables: "loot_tables",
  roll_tables: "roll_tables",
  npcs: "npcs",
  factions: "factions",
};

/** A long `.in()` list travels in the URL — chunk so a bulk move of hundreds
 *  of rows never trips a request-line length limit. */
const CHUNK_SIZE = 200;

export interface BulkScopeInput {
  table: BulkScopeTable;
  ids: readonly string[];
  campaignId: string | null;
}

async function bulkUpdateCampaignScope({ table, ids, campaignId }: BulkScopeInput): Promise<{ moved: number }> {
  let moved = 0;
  for (const chunk of chunkArray(ids, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from(table)
      .update({ campaign_id: campaignId })
      .in("id", [...chunk])
      .select("id");
    if (error) {
      // Reject rather than swallow — the caller must see the failure — but
      // stamp how many rows had already landed before this chunk failed, so a
      // caller that inspects the rejection can still report partial progress.
      (error as Error & { moved?: number }).moved = moved;
      throw error;
    }
    moved += (data ?? []).length;
  }
  return { moved };
}

export function useBulkCampaignScope(): UseMutationReturnType<
  { moved: number },
  Error,
  BulkScopeInput,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkUpdateCampaignScope,
    onSuccess: (_data, { table }) => {
      queryClient.invalidateQueries({ queryKey: [BULK_SCOPE_QUERY_KEY[table]] });
    },
  });
}
