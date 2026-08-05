import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bestiary retrieval shared by generators that need real creature names
 * (#595, #604).
 *
 * Extracted from generate-encounter when the mid-fight complication generator
 * became its second consumer — the same trigger that produced
 * campaignEntityRetrieval.ts, and for the same reason: the alternative was a
 * second copy of the two-corpus merge, and the copies would have drifted the
 * first time either the dedup tie-break or the unembedded window changed.
 *
 * What stayed BEHIND in generate-encounter, deliberately: its compact-index
 * fallback (a name-ordered slice of the whole bestiary used when retrieval is
 * unavailable). That fallback exists because encounter *building* must always
 * offer some creatures; a mid-fight complication has no such duty — if
 * retrieval is down it simply generates without creature candidates and the DM
 * gets narration. Pulling the fallback in here would have forced the caller
 * that does not want it to opt out of it.
 *
 * Throws on any DB/RPC error. Callers wrap this in their own try/catch and
 * degrade to an ungrounded prompt — retrieval is an enhancement, never a
 * requirement.
 */

export interface CandidateMonster {
  id: string;
  name: string;
  cr: string;
  type: string;
}

interface MatchRow {
  id: string;
  name: string;
  monster_type: string | null;
  challenge_rating: string | null;
}

interface CustomMonsterRow {
  id: string;
  name: string;
  monster_type: string | null;
  stat_block: { challenge_rating?: string } | null;
}

export interface MonsterRetrievalArgs {
  queryVector: string;
  /** campaigns.user_id — the DM whose bestiary is being searched, never the caller. */
  ownerId: string;
  campaignId: string;
  ruleset: string;
  embeddingModel: string;
  /** Rows to take from EACH corpus before merging. */
  perSide: number;
  /** Cap on not-yet-embedded custom monsters appended after retrieval. */
  unembeddedCap: number;
}

/** "?" rather than an empty string for an absent CR: the model reads this
 *  block, and a blank field reads as "CR zero" where a question mark reads as
 *  "unknown". Same convention generate-encounter has always used. */
function toCandidate(row: MatchRow): CandidateMonster {
  return {
    id: row.id,
    name: row.name,
    cr: row.challenge_rating ?? "?",
    type: row.monster_type ?? "?",
  };
}

function fromCustomRow(row: CustomMonsterRow): CandidateMonster {
  return {
    id: row.id,
    name: row.name,
    cr: row.stat_block?.challenge_rating ?? "?",
    type: row.monster_type ?? "?",
  };
}

/**
 * Custom + library creature candidates for one prompt embedding, merged
 * DM's-own-first and deduped case-insensitively by name.
 *
 * The library side is skipped entirely when the campaign has enabled no
 * sources — never called with an empty array, because a loosened predicate
 * would then leak content from books this campaign has not turned on, the
 * licensing mistake #567/#583 fixed.
 */
export async function retrieveMonsterCandidates(
  admin: SupabaseClient,
  args: MonsterRetrievalArgs,
): Promise<CandidateMonster[]> {
  // Error checked rather than defaulted away: a failed fetch here is
  // indistinguishable from "this campaign has enabled no sources", and the two
  // mean opposite things — the latter is a legitimate config, the former would
  // silently drop the entire library side with nothing in the logs.
  const { data: enabledSourceRows, error: enabledSourceError } = await admin
    .from("campaign_enabled_sources")
    .select("source_slug")
    .eq("campaign_id", args.campaignId);
  if (enabledSourceError) throw new Error(enabledSourceError.message);
  const enabledSlugs = (enabledSourceRows ?? []).map((r: { source_slug: string }) => r.source_slug);

  const customMatch = await admin.rpc("match_custom_monsters", {
    query_embedding:   args.queryVector,
    p_user_id:         args.ownerId,
    p_ruleset:         args.ruleset,
    p_embedding_model: args.embeddingModel,
    match_count:       args.perSide,
  });
  if (customMatch.error) throw new Error(`match_custom_monsters: ${customMatch.error.message}`);

  let libraryRows: MatchRow[] = [];
  if (enabledSlugs.length > 0) {
    const libraryMatch = await admin.rpc("match_library_monsters", {
      query_embedding:   args.queryVector,
      source_slugs:      enabledSlugs,
      p_ruleset:         args.ruleset,
      p_embedding_model: args.embeddingModel,
      match_count:       args.perSide,
    });
    if (libraryMatch.error) throw new Error(`match_library_monsters: ${libraryMatch.error.message}`);
    libraryRows = (libraryMatch.data ?? []) as MatchRow[];
  }

  const customCandidates = ((customMatch.data ?? []) as MatchRow[]).map(toCandidate);

  // A custom monster with no embedding row cannot be retrieved — which is
  // exactly the DM's newest homebrew, during the backfill window or before
  // embed-on-write lands. Queried fresh, ordered by RECENCY: any other
  // ordering decides which homebrew survives the cap by where its name sorts,
  // so a DM past the cap could find the monster they wrote five minutes ago
  // silently absent because it begins with "W".
  const { data: recentRows, error: recentError } = await admin
    .from("monsters")
    .select("id, name, monster_type, stat_block")
    .eq("user_id", args.ownerId)
    .or("open5e_import.is.null,open5e_import.eq.false")
    .or(`ruleset.is.null,ruleset.eq.${args.ruleset}`)
    .order("updated_at", { ascending: false })
    .limit(args.unembeddedCap * 2);
  if (recentError) throw new Error(recentError.message);
  const recent = (recentRows ?? []) as CustomMonsterRow[];

  const embeddedIds = new Set<string>();
  if (recent.length > 0) {
    const { data: embeddedRows, error: embeddedError } = await admin
      .from("monster_embeddings")
      .select("monster_id")
      .eq("embedding_model", args.embeddingModel)
      .in("monster_id", recent.map((m) => m.id));
    if (embeddedError) throw new Error(embeddedError.message);
    for (const row of (embeddedRows ?? []) as { monster_id: string }[]) {
      embeddedIds.add(row.monster_id);
    }
  }
  const unembedded = recent
    .filter((m) => !embeddedIds.has(m.id))
    .slice(0, args.unembeddedCap)
    .map(fromCustomRow);

  // Order matters, because the dedup keeps the FIRST occurrence of a name. The
  // DM's own monsters — retrieved or not-yet-embedded — go ahead of library
  // rows so that when both bestiaries hold a "Griffon", the DM sees their own.
  // Appending `unembedded` last would hand the collision to the library copy
  // and quietly drop the homebrew, the opposite of the homebrew-wins tie-break
  // resolveGeneratedCombatants applies downstream.
  const merged = [...customCandidates, ...unembedded, ...libraryRows.map(toCandidate)];
  const seen = new Set<string>();
  return merged.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
