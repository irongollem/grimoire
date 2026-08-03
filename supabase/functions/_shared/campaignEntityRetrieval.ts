import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Campaign-entity retrieval shared by grounded AI generators (#600).
 *
 * Extracted from generate-quest — the first grounded generator to reach
 * beyond the bestiary-only shape generate-encounter established (#595),
 * grounding generation in the campaign's own NPCs, locations and factions
 * via the same embed → RPC-retrieve → candidate-block shape, applied to
 * three entity types instead of one. generate-roll-table is the second
 * consumer; this module exists so retrieval machinery is shared rather than
 * duplicated by every future grounded generator.
 */

// ── Retrieval types ──────────────────────────────────────────────────────────

/** One line of the candidate block: a name plus its (possibly absent) descriptor. */
export interface CandidateEntity {
  name: string;
  descriptor: string | null;
}

interface NpcMatchRow { name: string; occupation: string | null }
interface NpcTableRow { id: string; name: string; occupation: string | null }

interface LocationMatchRow { name: string; location_type: string | null }
interface LocationTableRow { id: string; name: string; location_type: string | null }

interface FactionMatchRow { name: string; faction_type: string | null }
interface FactionTableRow { id: string; name: string; faction_type: string | null }

// match_count for each RPC — NPCs get the largest share since a generated
// hook or table entry typically hinges on a person (a giver, a target, a
// rival) more often than on a place or a group.
const RETRIEVAL_NPC_COUNT = 12;
const RETRIEVAL_LOCATION_COUNT = 10;
const RETRIEVAL_FACTION_COUNT = 8;

// Caps on unembedded rows appended after retrieval, per entity type — see
// retrieveEntityCandidates()'s doc comment for why this append exists at all.
const MAX_UNEMBEDDED_NPC = 8;
const MAX_UNEMBEDDED_LOCATION = 6;
const MAX_UNEMBEDDED_FACTION = 4;

// ── Retrieval helper ─────────────────────────────────────────────────────────

/**
 * Retrieval + unembedded-append + case-insensitive dedup for ONE campaign
 * entity type (npc / location / faction). All three RPCs
 * (match_campaign_npcs/_locations/_factions) share the exact same signature
 * — (query_embedding, p_campaign_id, p_owner_id, p_embedding_model,
 * match_count) — and all three side tables (npc_embeddings/
 * location_embeddings/faction_embeddings) share the exact same shape — an
 * entity-id primary key plus embedding_model — so this is one function
 * called three times rather than three near-identical blocks copy-pasted.
 * Compare generate-encounter's single-entity version of the same shape,
 * which has no sibling to share with and so stays inline.
 *
 * Throws on any DB/RPC error — this function does not swallow failures
 * itself. Callers (via retrieveCampaignEntities below) wrap the whole
 * three-type retrieval in one try/catch so that any single type failing
 * drops the WHOLE entity block, not just that type: a partially-grounded
 * generation (real NPCs but hallucinated factions) is a worse, more
 * confusing failure mode than "no grounding this time".
 */
async function retrieveEntityCandidates<
  MatchRow extends { name: string },
  TableRow extends { id: string; name: string },
>(
  admin: SupabaseClient,
  opts: {
    rpcName: string;
    matchCount: number;
    descriptorOfMatch: (row: MatchRow) => string | null;
    table: string;
    selectColumns: string;
    descriptorOfTableRow: (row: TableRow) => string | null;
    embeddingTable: string;
    embeddingIdColumn: string;
    unembeddedCap: number;
  },
  args: { queryVector: string; campaignId: string; ownerId: string; embeddingModel: string },
): Promise<CandidateEntity[]> {
  const match = await admin.rpc(opts.rpcName, {
    query_embedding: args.queryVector,
    p_campaign_id: args.campaignId,
    p_owner_id: args.ownerId,
    p_embedding_model: args.embeddingModel,
    match_count: opts.matchCount,
  });
  if (match.error) throw new Error(`${opts.rpcName}: ${match.error.message}`);
  const retrieved = ((match.data ?? []) as MatchRow[]).map((row) => ({
    name: row.name,
    descriptor: opts.descriptorOfMatch(row),
  }));

  // Unembedded append — mirrors generate-encounter's MAX_UNEMBEDDED_APPEND.
  // An NPC/location/faction written after the last backfill run (or before
  // embed-on-write lands for this entity type) has no side-table row yet and
  // would otherwise be invisible to the RPC above no matter how well it
  // matches the prompt. Queried fresh, most-recently-updated first — the
  // same recency-not-alphabetical reasoning as generate-encounter's version —
  // and scoped by the same campaign-or-owner-global predicate the RPC itself
  // applies (a DM-owned entity with no campaign_id is reusable across all of
  // that DM's campaigns, per the factions_update/factions_delete RLS policy).
  // Predicate matches the RPC's WHERE exactly: any row in this campaign
  // (whoever authored it — a co-DM's NPC counts), plus the OWNER's global
  // (null-campaign) rows. A stricter owner-only filter here would make a
  // co-DM's entity retrievable once embedded but invisible during the
  // unembedded window — an inconsistency with no upside.
  const { data: recentRows, error: recentError } = await admin
    .from(opts.table)
    .select(opts.selectColumns)
    .or(`campaign_id.eq.${args.campaignId},and(campaign_id.is.null,user_id.eq.${args.ownerId})`)
    .order("updated_at", { ascending: false })
    .limit(opts.unembeddedCap * 2);
  if (recentError) throw new Error(recentError.message);
  // `opts.selectColumns` is a runtime string, not a literal, so supabase-js
  // can't infer a row type from it — it falls back to `GenericStringError`,
  // which the direct cast below would otherwise (rightly) reject as
  // non-overlapping. Going through `unknown` is TS's own suggested escape
  // hatch for exactly this "trust me" case.
  const recent = (recentRows ?? []) as unknown as TableRow[];

  const embeddedIds = new Set<string>();
  if (recent.length > 0) {
    const { data: embeddedRows, error: embeddedError } = await admin
      .from(opts.embeddingTable)
      .select(opts.embeddingIdColumn)
      .eq("embedding_model", args.embeddingModel)
      .in(opts.embeddingIdColumn, recent.map((r) => r.id));
    if (embeddedError) throw new Error(embeddedError.message);
    // Same GenericStringError situation as `recent` above — embeddingIdColumn
    // is a runtime string too.
    for (const row of (embeddedRows ?? []) as unknown as Record<string, string>[]) {
      embeddedIds.add(row[opts.embeddingIdColumn]);
    }
  }
  const unembedded = recent
    .filter((r) => !embeddedIds.has(r.id))
    .slice(0, opts.unembeddedCap)
    .map((r) => ({ name: r.name, descriptor: opts.descriptorOfTableRow(r) }));

  // Order matters: the dedup below keeps the FIRST occurrence of a name, and
  // retrieval rows go first so a name collision resolves to the
  // already-embedded (ranked-by-relevance) row rather than the row appended
  // only because it hasn't been embedded yet — same tie-break generate-
  // encounter applies between its custom and library candidates.
  const merged = [...retrieved, ...unembedded];
  const seen = new Set<string>();
  return merged.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Retrieve the campaign's NPC/location/faction candidates for one prompt
 * embedding, all three types in parallel — exactly what generate-quest did
 * inline before this extraction. Throws (does not swallow) on any failure;
 * callers are expected to wrap this in their own try/catch and fall back to
 * an empty entity block, the same "retrieval is an enhancement, never a
 * requirement" contract generate-quest and generate-encounter both apply.
 */
export async function retrieveCampaignEntities(
  admin: SupabaseClient,
  args: { queryVector: string; campaignId: string; ownerId: string; embeddingModel: string },
): Promise<{ npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] }> {
  const [npcs, locations, factions] = await Promise.all([
    retrieveEntityCandidates<NpcMatchRow, NpcTableRow>(admin, {
      rpcName:             "match_campaign_npcs",
      matchCount:          RETRIEVAL_NPC_COUNT,
      descriptorOfMatch:   (r) => r.occupation,
      table:               "npcs",
      selectColumns:       "id, name, occupation",
      descriptorOfTableRow: (r) => r.occupation,
      embeddingTable:      "npc_embeddings",
      embeddingIdColumn:   "npc_id",
      unembeddedCap:       MAX_UNEMBEDDED_NPC,
    }, args),
    retrieveEntityCandidates<LocationMatchRow, LocationTableRow>(admin, {
      rpcName:             "match_campaign_locations",
      matchCount:          RETRIEVAL_LOCATION_COUNT,
      descriptorOfMatch:   (r) => r.location_type,
      table:               "locations",
      selectColumns:       "id, name, location_type",
      descriptorOfTableRow: (r) => r.location_type,
      embeddingTable:      "location_embeddings",
      embeddingIdColumn:   "location_id",
      unembeddedCap:       MAX_UNEMBEDDED_LOCATION,
    }, args),
    retrieveEntityCandidates<FactionMatchRow, FactionTableRow>(admin, {
      rpcName:             "match_campaign_factions",
      matchCount:          RETRIEVAL_FACTION_COUNT,
      descriptorOfMatch:   (r) => r.faction_type,
      table:               "factions",
      selectColumns:       "id, name, faction_type",
      descriptorOfTableRow: (r) => r.faction_type,
      embeddingTable:      "faction_embeddings",
      embeddingIdColumn:   "faction_id",
      unembeddedCap:       MAX_UNEMBEDDED_FACTION,
    }, args),
  ]);
  return { npcs, locations, factions };
}

/**
 * Render retrieved candidates into the fixed-format block appended to the
 * USER content (not system) — a downstream client-side resolver depends on
 * these exact field names ("npc"/"location"/"faction") to map generated
 * entities back to real records by name. An absent descriptor is an empty
 * field, not "?" — unlike generate-encounter's CR field, "no occupation on
 * file" isn't a meaningful unknown worth flagging to the model, just
 * nothing to say.
 *
 * Callers decide WHETHER to call this (generate-quest and generate-roll-
 * table both skip it — and keep the prompt free of an empty
 * ---BEGIN/END--- shell — when retrieval found zero candidates); this
 * function only formats.
 *
 * `activity` is the one generator-specific phrase in the instruction
 * sentence — "writing hooks" for quests, "writing table entries" for roll
 * tables — so a roll-table prompt never talks about hooks.
 */
export function formatEntityBlock(
  candidates: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] },
  activity: string,
): string {
  const lines = [
    ...candidates.npcs.map((c) => `npc|${c.name}|${c.descriptor ?? ""}`),
    ...candidates.locations.map((c) => `location|${c.name}|${c.descriptor ?? ""}`),
    ...candidates.factions.map((c) => `faction|${c.name}|${c.descriptor ?? ""}`),
  ];
  return (
    `\n\nReal entities already in this campaign. Prefer these when ${activity} — use the exact ` +
    "names shown, the app resolves them back to real records by name — and invent new minor " +
    "characters, places, or groups only where the story needs them.\n" +
    "---BEGIN CAMPAIGN ENTITIES---\n" +
    lines.join("\n") +
    "\n---END CAMPAIGN ENTITIES---"
  );
}
