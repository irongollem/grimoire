import { useMutation, useQueryClient, type UseMutationReturnType } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { chunkArray } from "@/lib/utils";
import { JOIN_TABLES_REQUIRING_CAMPAIGN, type CopyJoinTable } from "@/lib/campaign/copyToCampaign";

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
 *
 * ## Children follow their owner (#885)
 *
 * Two entity tables — `npcs` and `factions` — have campaign-scoped join-table
 * children whose own `campaign_id` does not follow the parent row for free:
 * `kin_links` (see `moveKinLinks`), `world_links` (see `moveWorldLinks`), and `npc_inventory`
 * (owned by `npc_id`). `CHILD_TABLES` below names the owned one;
 * `moveChildRows` re-stamps its `campaign_id` after every entity chunk
 * has landed. The remaining join table `copyToCampaign.ts` knows about
 * (`faction_npcs`) carries no `campaign_id` at all — it is scoped
 * transitively through the faction — so a faction move needs to touch nothing
 * on it.
 *
 * A world link (#1084) has two ends and a `campaign_id` of its own, and the
 * database refuses one whose ends are not all in that campaign. So, like a
 * family link, it cannot follow one end alone: a link whose two ends both moved
 * is re-stamped, and every other link of a moved NPC or faction (the other end
 * stayed, is a different kind of thing, or is a player character) would now
 * span two campaigns, so it is deleted and counted. The general scope holds no
 * link at all (`campaign_id` is NOT NULL), which is why
 * `bulkScopeAllowsGeneral` is false for both tables.
 *
 * `npc_inventory` has a **NOT NULL** `campaign_id` too — see
 * `JOIN_TABLES_REQUIRING_CAMPAIGN` in `copyToCampaign.ts`, imported rather than
 * re-declared here so the fact has one source. That is the reasoning
 * `bulkScopeAllowsGeneral` below turns into a prop the UI can act on: a general
 * ("every campaign") move of an NPC or faction cannot carry those rows, because
 * there is no such thing as an inventory line or a link belonging to every
 * campaign at once. The client never relaxes that constraint — it stops
 * offering the move instead.
 *
 * A failure partway through `moveChildRows` means every entity row in this
 * batch has already fully moved (the entity loop above only reaches here
 * once it has completed without error), but that batch's links or
 * inventory may now be split between the old and new
 * `campaign_id`. Re-running the same move is the recovery: the entity update
 * is a no-op for rows already at the target, and `moveChildRows` matches by
 * owner id regardless of a child row's current `campaign_id`, so it simply
 * finishes the rows it did not reach the first time.
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
 * key module-private (`const QUERY_KEY = "<table>"` — `useItems.ts`,
 * `useMonsters.ts`, `useSpecies.ts:14`, `useSpells.ts`, `useTraps.ts:12`,
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

/** One campaign-scoped join table that rides along with a moved entity, and
 *  the column naming the entity it hangs off. See the module docstring's
 *  "Children follow their owner" section for which tables are here. */
interface ChildTable {
  table: CopyJoinTable;
  ownerColumn: string;
}

const CHILD_TABLES: Partial<Record<BulkScopeTable, readonly ChildTable[]>> = {
  npcs: [{ table: "npc_inventory", ownerColumn: "npc_id" }],
};

/** The tables whose rows can be an end of a world link, with the two columns that hold that end. */
const LINK_END_COLUMNS: Partial<Record<BulkScopeTable, readonly ["from_npc_id" | "from_faction_id", "to_npc_id" | "to_faction_id"]>> = {
  npcs: ["from_npc_id", "to_npc_id"],
  factions: ["from_faction_id", "to_faction_id"],
};

/**
 * False for a table whose bulk move can never legally reach the general
 * ("available in all campaigns", `campaign_id: null`) scope, because at
 * least one of its campaign-scoped children has a **NOT NULL** `campaign_id`
 * (`JOIN_TABLES_REQUIRING_CAMPAIGN`) — there is no such thing as an inventory
 * line or a deity link belonging to every campaign at once. `BulkScopeBar`'s
 * `allowGeneralScope` prop is how a caller acts on this without repeating the
 * reasoning at every call site.
 */
export function bulkScopeAllowsGeneral(table: BulkScopeTable): boolean {
  // A world link holds campaign_id NOT NULL (JOIN_TABLES_REQUIRING_CAMPAIGN), and an NPC or faction can be one end.
  if (table in LINK_END_COLUMNS) return false;
  const children = CHILD_TABLES[table];
  if (!children) return true;
  return !children.some((child) => child.table in JOIN_TABLES_REQUIRING_CAMPAIGN);
}

/**
 * Family links (#1083) join two people of one campaign, so they cannot follow one NPC alone: a link whose
 * two NPC ends both moved is re-stamped, and every other link of a moved NPC (the other end stayed, or is a
 * PC, who stays) would now span two campaigns, which the database refuses, so it is deleted. That is the
 * same trade `bulkScopeAllowsGeneral` makes for inventory: a family belongs to one campaign.
 */
async function moveKinLinks(ownerIds: readonly string[], campaignId: string | null): Promise<number> {
  const moved = new Set(ownerIds);
  const links = new Map<string, { id: string; from: string | null; to: string | null }>();
  for (const column of ["from_npc_id", "to_npc_id"] as const) {
    for (const chunk of chunkArray(ownerIds, CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("kin_links")
        .select("id, from_npc_id, to_npc_id")
        .in(column, [...chunk]);
      if (error) throw error;
      for (const row of data) links.set(row.id, { id: row.id, from: row.from_npc_id, to: row.to_npc_id });
    }
  }
  const keep: string[] = [];
  const drop: string[] = [];
  for (const link of links.values()) {
    const together = link.from !== null && link.to !== null && moved.has(link.from) && moved.has(link.to);
    (together && campaignId !== null ? keep : drop).push(link.id);
  }
  // Delete first: a stray cross-campaign link must be gone before the survivors are re-stamped.
  for (const chunk of chunkArray(drop, CHUNK_SIZE)) {
    const { error } = await supabase.from("kin_links").delete().in("id", [...chunk]).select("id");
    if (error) throw error;
  }
  for (const chunk of chunkArray(keep, CHUNK_SIZE)) {
    const { error } = await supabase.from("kin_links").update({ campaign_id: campaignId }).in("id", [...chunk]).select("id");
    if (error) throw error;
  }
  return drop.length;
}

/**
 * World links (#1084) join two things of one campaign, so they follow the same rule family links do: a link whose
 * two ends both moved is re-stamped, and every other link of a moved NPC or faction would now span two campaigns,
 * which the database refuses, so it is deleted. Returns how many were deleted.
 */
async function moveWorldLinks(table: BulkScopeTable, ownerIds: readonly string[], campaignId: string | null): Promise<number> {
  const endColumns = LINK_END_COLUMNS[table];
  if (!endColumns) return 0;
  const moved = new Set(ownerIds);
  const links = new Map<string, { id: string; from: string; to: string }>();
  for (const column of endColumns) {
    for (const chunk of chunkArray(ownerIds, CHUNK_SIZE)) {
      const { data, error } = await supabase.from("world_links").select("id, from_id, to_id").in(column, [...chunk]);
      if (error) throw error;
      for (const row of data) links.set(row.id, { id: row.id, from: row.from_id, to: row.to_id });
    }
  }
  const keep: string[] = [];
  const drop: string[] = [];
  for (const link of links.values()) {
    const together = moved.has(link.from) && moved.has(link.to);
    (together && campaignId !== null ? keep : drop).push(link.id);
  }
  // Delete first: a stray cross-campaign link must be gone before the survivors are re-stamped.
  for (const chunk of chunkArray(drop, CHUNK_SIZE)) {
    const { error } = await supabase.from("world_links").delete().in("id", [...chunk]).select("id");
    if (error) throw error;
  }
  for (const chunk of chunkArray(keep, CHUNK_SIZE)) {
    const { error } = await supabase.from("world_links").update({ campaign_id: campaignId }).in("id", [...chunk]).select("id");
    if (error) throw error;
  }
  return drop.length;
}

/** Re-stamps `campaignId` on every campaign-scoped join table `table`'s moved
 *  rows own, chunked the same way the entity update above is. A no-op for the
 *  eight tables with no entry in `CHILD_TABLES`. */
async function moveChildRows(
  table: BulkScopeTable,
  ownerIds: readonly string[],
  campaignId: string | null,
): Promise<{ familyLinksRemoved: number; worldLinksRemoved: number }> {
  if (!ownerIds.length) return { familyLinksRemoved: 0, worldLinksRemoved: 0 };
  // The links removed (see moveKinLinks, moveWorldLinks), so the move can say so rather than lose them quietly.
  const familyLinksRemoved = table === "npcs" ? await moveKinLinks(ownerIds, campaignId) : 0;
  const worldLinksRemoved = await moveWorldLinks(table, ownerIds, campaignId);
  for (const child of CHILD_TABLES[table] ?? []) {
    for (const chunk of chunkArray(ownerIds, CHUNK_SIZE)) {
      const { error } = await supabase
        .from(child.table)
        .update({ campaign_id: campaignId })
        .in(child.ownerColumn, [...chunk])
        .select("id");
      if (error) throw error;
    }
  }
  return { familyLinksRemoved, worldLinksRemoved };
}

export interface BulkScopeResult {
  moved: number;
  /** Family links (#1083) of a moved NPC to someone who stayed behind: a family belongs to one campaign. */
  familyLinksRemoved: number;
  /** World links (#1084) of a moved NPC or faction to something that stayed behind: a link cannot cross campaigns. */
  worldLinksRemoved: number;
}

async function bulkUpdateCampaignScope({ table, ids, campaignId }: BulkScopeInput): Promise<BulkScopeResult> {
  // Ids Postgres actually reported back as updated — not necessarily every id
  // requested, since RLS silently drops any id that is not the caller's own
  // (see the module docstring). Children are moved for exactly this set, so a
  // stray id belonging to nobody the caller owns can never reach a child-table
  // write either.
  const movedIds: string[] = [];
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
      (error as Error & { moved?: number }).moved = movedIds.length;
      throw error;
    }
    movedIds.push(...(data ?? []).map((row) => row.id as string));
  }

  let removed = { familyLinksRemoved: 0, worldLinksRemoved: 0 };
  try {
    removed = await moveChildRows(table, movedIds, campaignId);
  } catch (error) {
    // Every entity row already moved by this point (the loop above only
    // exits without throwing once every chunk has landed) — see "Children
    // follow their owner" in the module docstring for what a failure here
    // means and how re-running the move recovers.
    (error as Error & { moved?: number }).moved = movedIds.length;
    throw error;
  }

  return { moved: movedIds.length, ...removed };
}

export function useBulkCampaignScope(): UseMutationReturnType<
  BulkScopeResult,
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
