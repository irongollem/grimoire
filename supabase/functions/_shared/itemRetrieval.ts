import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Item retrieval for the grounded loot-table generator (#602).
 *
 * A sibling of campaignEntityRetrieval.ts, not a consumer of it, for one
 * structural reason: every RPC that module drives has the same
 * (query_embedding, campaign, owner, model, count) signature over a
 * single-corpus, DM-authored table. Items have neither property. They span
 * TWO corpora — the DM's `items` and shared `library_items`, the same split
 * generate-encounter faces for the bestiary — and, uniquely so far, they need
 * a CONSTRAINT BAND.
 *
 * The band is why loot could not just reuse the entity retrieval shape.
 * "Loot for a level 7 party" is a constraint query wearing a semantic query's
 * clothes: cosine similarity ranks a Vorpal Sword top for "impressive
 * treasure", and a model handed that candidate will use it. So rarity and
 * attunement are WHERE predicates inside the match RPCs (20260805000002),
 * applied BEFORE ranking — exactly like the enabled-sources gate — and
 * retrieval then ranks thematically *within* the band the DM asked for. The
 * same predicates are re-applied to the unembedded append below, or that
 * append would be a hole straight through the gate.
 *
 * Throws on any DB/RPC error; it does not swallow failures. The caller wraps
 * the whole thing in one try/catch and falls back to an unground prompt —
 * the same "retrieval is an enhancement, never a requirement" contract
 * generate-encounter, generate-quest and generate-roll-table all apply.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** One line of the candidate block. `rarity`/`itemType` are NOT NULL in both
 * corpora, so unlike CandidateEntity's descriptor neither is nullable. */
export interface CandidateItem {
  name: string;
  rarity: string;
  itemType: string;
}

interface ItemMatchRow { name: string; rarity: string; item_type: string }
interface ItemTableRow { id: string; name: string; rarity: string; item_type: string }

export interface ItemRetrievalArgs {
  queryVector: string;
  campaignId: string;
  /** campaigns.user_id — never a caller-supplied id. */
  ownerId: string;
  embeddingModel: string;
  ruleset: string;
  /** Rarities the band allows. Empty = no rarity constraint (the RPCs guard
   *  the `any` predicate on cardinality, so empty means "all", not "none"). */
  rarities: string[];
  excludeAttunement: boolean;
  /** `source_document_key` values the campaign may draw shared items from —
   *  'grimoire-bundled' plus the campaign's enabled slugs, matching
   *  fetchLibraryItems()'s `.in()` list in useItems.ts exactly. */
  sourceKeys: string[];
}

// Split roughly evenly between the two corpora. The DM's own vault gets the
// slightly smaller share only because it is usually the smaller corpus (2,015
// rows across all users today vs 1,717 shared) — but it is ordered FIRST in
// the merge below, so on a name collision the DM's own item is what the model
// is offered.
const RETRIEVAL_CUSTOM_COUNT = 14;
const RETRIEVAL_LIBRARY_COUNT = 16;

// Cap on unembedded custom rows appended after retrieval — see the append's
// comment for why it exists at all.
const MAX_UNEMBEDDED_APPEND = 8;

// ── Retrieval ────────────────────────────────────────────────────────────────

function toCandidate(row: ItemMatchRow | ItemTableRow): CandidateItem {
  return { name: row.name, rarity: row.rarity, itemType: row.item_type };
}

/**
 * Custom + library item candidates for one prompt embedding, band-filtered,
 * merged custom-first and deduped case-insensitively by name.
 *
 * Both RPCs run in parallel; the library one is skipped entirely when the
 * campaign has enabled no sources beyond the bundled gear — never called with
 * an empty array, on the same reasoning as generate-encounter: a loosened
 * predicate would then leak content from books the campaign has not turned
 * on, which is the licensing mistake #567/#583 fixed.
 */
export async function retrieveLootItems(
  admin: SupabaseClient,
  args: ItemRetrievalArgs,
): Promise<CandidateItem[]> {
  const [customMatch, libraryMatch] = await Promise.all([
    admin.rpc("match_custom_items", {
      query_embedding:      args.queryVector,
      p_campaign_id:        args.campaignId,
      p_owner_id:           args.ownerId,
      p_rarities:           args.rarities,
      p_exclude_attunement: args.excludeAttunement,
      p_embedding_model:    args.embeddingModel,
      match_count:          RETRIEVAL_CUSTOM_COUNT,
    }),
    args.sourceKeys.length > 0
      ? admin.rpc("match_library_items", {
        query_embedding:      args.queryVector,
        source_keys:          args.sourceKeys,
        p_ruleset:            args.ruleset,
        p_rarities:           args.rarities,
        p_exclude_attunement: args.excludeAttunement,
        p_embedding_model:    args.embeddingModel,
        match_count:          RETRIEVAL_LIBRARY_COUNT,
      })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customMatch.error) throw new Error(`match_custom_items: ${customMatch.error.message}`);
  if (libraryMatch.error) throw new Error(`match_library_items: ${libraryMatch.error.message}`);

  const custom = ((customMatch.data ?? []) as ItemMatchRow[]).map(toCandidate);
  const library = ((libraryMatch.data ?? []) as ItemMatchRow[]).map(toCandidate);
  const unembedded = await fetchUnembeddedCustomItems(admin, args);

  // Order matters: the dedup keeps the FIRST occurrence of a name. Retrieved
  // custom rows, then the DM's not-yet-embedded ones, then library rows — so
  // when both vaults hold a "Flame Tongue" the DM is offered their own copy
  // (which may be a homebrew rewrite), and a clone of a library item never
  // shadows the DM's edited version. Same tie-break generate-encounter applies
  // between its two bestiaries.
  const merged = [...custom, ...unembedded, ...library];
  const seen = new Set<string>();
  return merged.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The DM's most recently updated in-band items that have no embedding row yet.
 *
 * A custom item written after the last backfill (or while embed-on-write was
 * in flight) has no side-table row and would otherwise be invisible to the RPC
 * no matter how well it matches — which is exactly the homebrew the DM wrote
 * five minutes before generating a hoard. Queried by RECENCY, not name, for
 * the same reason generate-encounter's equivalent append is: any other
 * ordering decides which homebrew survives the cap by where its name sorts.
 *
 * The band and scope predicates are re-applied here deliberately. This path
 * bypasses the RPC, so without them an out-of-band legendary the DM saved
 * yesterday would walk straight past the gate the whole feature is built on.
 *
 * No library equivalent exists: `library_items` changes only on an admin
 * import, so the batch backfill is the right and only cadence for it.
 */
async function fetchUnembeddedCustomItems(
  admin: SupabaseClient,
  args: ItemRetrievalArgs,
): Promise<CandidateItem[]> {
  let query = admin
    .from("items")
    .select("id, name, rarity, item_type")
    // Campaign rows plus the OWNER's global (null-campaign) rows — matches
    // match_custom_items' WHERE exactly.
    .or(`campaign_id.eq.${args.campaignId},and(campaign_id.is.null,user_id.eq.${args.ownerId})`)
    .order("updated_at", { ascending: false })
    .limit(MAX_UNEMBEDDED_APPEND * 2);
  if (args.rarities.length > 0) query = query.in("rarity", args.rarities);
  if (args.excludeAttunement) query = query.eq("requires_attunement", false);

  const { data: recentRows, error: recentError } = await query;
  if (recentError) throw new Error(recentError.message);
  const recent = (recentRows ?? []) as unknown as ItemTableRow[];
  if (recent.length === 0) return [];

  const { data: embeddedRows, error: embeddedError } = await admin
    .from("item_embeddings")
    .select("item_id")
    .eq("embedding_model", args.embeddingModel)
    .in("item_id", recent.map((r) => r.id));
  if (embeddedError) throw new Error(embeddedError.message);
  const embeddedIds = new Set((embeddedRows ?? []).map((r: { item_id: string }) => r.item_id));

  return recent
    .filter((r) => !embeddedIds.has(r.id))
    .slice(0, MAX_UNEMBEDDED_APPEND)
    .map(toCandidate);
}

// ── Prompt block ─────────────────────────────────────────────────────────────

/**
 * Render retrieved items into the fixed-format block appended to the USER
 * content (not system). The `item|Name|rarity|type` field order is a contract
 * with the client-side resolver (src/ai/resolveGeneratedLoot.ts), which maps
 * generated `item_name` values back to real vault rows by name — so the
 * instruction to use the EXACT names shown is load-bearing, not politeness.
 *
 * Callers decide WHETHER to call this: a zero-candidate retrieval must produce
 * no prompt text at all rather than an empty ---BEGIN/END--- shell.
 */
export function formatItemBlock(candidates: CandidateItem[]): string {
  const lines = candidates.map((c) => `item|${c.name}|${c.rarity}|${c.itemType}`);
  return (
    "\n\nReal items already available to this campaign — the DM's own vault plus the shared " +
    "sources they have enabled, already filtered to the tier requested above. Build the hoard " +
    "from these, using the exact names shown: the app resolves them back to real item records " +
    "by name, and an item it cannot resolve is left out of the table. Only invent a name when " +
    "nothing offered fits.\n" +
    "---BEGIN VAULT ITEMS---\n" +
    lines.join("\n") +
    "\n---END VAULT ITEMS---"
  );
}
