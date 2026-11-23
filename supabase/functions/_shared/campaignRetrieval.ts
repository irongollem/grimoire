// Campaign-wide retrieval by meaning (#599, shared with Ask Grimoire in #1253): the match RPCs over the DM's own
// NPCs, places, factions, notes, quests, canon, items and monsters (and the library sides of the sources the
// campaign enabled), ranked by distance. The caller embeds the query and decides who may ask; this runs the reads.
//
// It is a read of the DM's own writing and generates nothing. Player-authored tables (entity_notes,
// player_journal_entries, npc_player_notes) are never indexed, so no caller can read them through here: they have a
// data subject who is not the account holder, and the notes of one player are not another's to see.
//
// Not plan-gated here. `search-campaign` keeps its Pro gate in its own handler, because Pro is that function's rule
// (search by meaning is a plan feature); Ask is open to every plan and bills its answers, so it gates elsewhere.

import type { SupabaseClient } from "@supabase/supabase-js";
import { gameSystemEdition } from "./gameSystem.ts";
import {
  DM_SEARCH_NOTE_SCOPE,
  noteHitLabel,
  rankSearchHits,
  type CampaignSearchHit,
  type CampaignSearchKind,
} from "./campaignSearch.ts";
import { CANON_PARTS } from "../../../src/types/canon.types.ts";

const MATCH_COUNT = 8;

/** Enum values read as words in the dropdown: "point_of_interest" -> "point of interest". */
function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/** Non-empty parts, humanized, joined with ", " or null when there are none. */
function join(...parts: (string | null | undefined)[]): string | null {
  const present = parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return present.length > 0 ? present.map(humanize).join(", ") : null;
}

interface RpcResult {
  kind: CampaignSearchKind;
  hits: CampaignSearchHit[];
  failed: boolean;
}

/** Runs one match RPC; a failure drops that kind (logged), never the search. */
async function runMatch(
  kind: CampaignSearchKind,
  call: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  toHit: (row: Record<string, unknown>) => CampaignSearchHit,
): Promise<RpcResult> {
  try {
    const { data, error } = await call;
    if (error) {
      console.error(`campaign retrieval: ${kind} match failed:`, error.message);
      return { kind, hits: [], failed: true };
    }
    return { kind, hits: ((data ?? []) as Record<string, unknown>[]).map(toHit), failed: false };
  } catch (e) {
    console.error(`campaign retrieval: ${kind} match threw:`, e);
    return { kind, hits: [], failed: true };
  }
}

function simple(
  kind: CampaignSearchKind,
  nameKey: string,
  descriptor: (row: Record<string, unknown>) => string | null,
): (row: Record<string, unknown>) => CampaignSearchHit {
  return (row) => ({
    kind,
    id: String(row.id),
    name: String(row[nameKey]),
    descriptor: join(descriptor(row)),
    distance: Number(row.distance),
  });
}

const itemDescriptor = (row: Record<string, unknown>) =>
  join(row.item_type as string | null, row.rarity as string | null);
const monsterDescriptor = (row: Record<string, unknown>) =>
  join(
    row.monster_type as string | null,
    row.challenge_rating != null && row.challenge_rating !== "" ? `CR ${row.challenge_rating}` : null,
  );

export interface CampaignRetrieval {
  /** Every hit of every kind, unranked: what a rerank pools from. */
  allHits: CampaignSearchHit[];
  /** The hits in distance order. */
  ranked: CampaignSearchHit[];
  /** True when every match call failed: the search did not run, which is not the same as finding nothing. */
  allFailed: boolean;
}

export async function retrieveCampaignHits(
  admin: SupabaseClient,
  input: {
    campaignId: string;
    ownerId: string;
    gameSystem: string | null;
    /** The query's embedding as a vector literal (`toVectorLiteral`). */
    vector: string;
    /** The embedding model, so only vectors of the same model are compared. */
    model: string;
  },
): Promise<CampaignRetrieval> {
  const { campaignId, vector, model } = input;
  // Same source derivation as generate-loot / generate-encounter. A Generic campaign has no edition and no 5e monster
  // or library content, so those searches are skipped (never scoped to a fabricated 2014). An unreadable source list
  // drops the library sides (logged) rather than failing the search; it is never read as "none enabled".
  const ruleset = gameSystemEdition(input.gameSystem);
  // Only the library sides read the enabled sources, and a system with no edition has none.
  let enabledSlugs: string[] = [];
  if (ruleset) {
    const { data: enabledRows, error: enabledError } = await admin
      .from("campaign_enabled_sources")
      .select("source_slug")
      .eq("campaign_id", campaignId);
    if (enabledError) console.error("campaign retrieval: enabled sources lookup failed:", enabledError.message);
    else enabledSlugs = (enabledRows ?? []).map((r: { source_slug: string }) => r.source_slug);
  }

  const scope = { p_campaign_id: campaignId, p_owner_id: input.ownerId, p_embedding_model: model };

  const jobs: Promise<RpcResult>[] = [
    runMatch("npc", admin.rpc("match_campaign_npcs", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("npc", "name", (r) => (r.occupation as string | null) ?? null)),
    runMatch("location", admin.rpc("match_campaign_locations", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("location", "name", (r) => (r.location_type as string | null) ?? null)),
    runMatch("faction", admin.rpc("match_campaign_factions", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("faction", "name", (r) => (r.faction_type as string | null) ?? null)),
    runMatch("note", admin.rpc("match_campaign_notes", {
      query_embedding: vector, ...scope, p_exclude_id: null, ...DM_SEARCH_NOTE_SCOPE, match_count: MATCH_COUNT,
    }), simple("note", "title", (r) =>
      noteHitLabel(r.session_num))),
    runMatch("quest", admin.rpc("match_campaign_quests", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("quest", "title", (r) => (r.status as string | null) ?? null)),
    // The DM reads every part of their own canon, secrets included, so every part is asked for here; the Narrator's
    // lookup asks for the others only (agent-turn/canonLookup.ts).
    runMatch("canon", admin.rpc("match_campaign_canon", {
      query_embedding: vector, p_campaign_id: campaignId, p_embedding_model: model, p_parts: [...CANON_PARTS], match_count: MATCH_COUNT,
    }), simple("canon", "title", (r) => (r.part as string | null) ?? null)),
    runMatch("item", admin.rpc("match_custom_items", {
      query_embedding: vector, ...scope, p_rarities: [], p_exclude_attunement: false, match_count: MATCH_COUNT,
    }), simple("item", "name", itemDescriptor)),
  ];
  if (ruleset) {
    jobs.push(runMatch("monster", admin.rpc("match_custom_monsters", {
      query_embedding: vector, ...scope, p_ruleset: ruleset, match_count: MATCH_COUNT,
    }), simple("monster", "name", monsterDescriptor)));
  }

  // Library sides only when sources are enabled -- never called with an empty
  // array, which would loosen the predicate (the #567/#583 licensing mistake).
  if (ruleset && enabledSlugs.length > 0) {
    jobs.push(
      runMatch("library_item", admin.rpc("match_library_items", {
        query_embedding: vector, source_keys: ["grimoire-bundled", ...enabledSlugs], p_ruleset: ruleset,
        p_rarities: [], p_exclude_attunement: false, p_embedding_model: model, match_count: MATCH_COUNT,
      }), simple("library_item", "name", itemDescriptor)),
      runMatch("library_monster", admin.rpc("match_library_monsters", {
        query_embedding: vector, source_slugs: enabledSlugs, p_ruleset: ruleset,
        p_embedding_model: model, match_count: MATCH_COUNT,
      }), simple("library_monster", "name", monsterDescriptor)),
    );
  }

  const results = await Promise.all(jobs);
  const allHits = results.flatMap((r) => r.hits);
  return { allHits, ranked: rankSearchHits(allHits), allFailed: results.every((r) => r.failed) };
}
