import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { isAccountSuspended, isChildAccount, suspendedResponse } from "../_shared/accountGate.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { EmbeddingProviderConfigError, resolveEmbeddingProvider, toVectorLiteral } from "../_shared/embeddings.ts";
import { judge, JEV_MODEL, judgingKey, noulOf } from "../_shared/typesafe.ts";
import {
  buildEntry,
  rerankHits,
  rowSourceFor,
  type EntryFields,
} from "./rerank.ts";
import {
  DM_SEARCH_NOTE_SCOPE,
  hitKey,
  noteHitLabel,
  rankSearchHits,
  rerankPool,
  type CampaignSearchHit,
  type CampaignSearchKind,
  type CampaignSearchResponse,
  type CampaignSearchUnavailable,
} from "../_shared/campaignSearch.ts";
import { UUID_RE } from "../_shared/uuid.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { CANON_PARTS } from "../../../src/types/canon.types.ts";

/**
 * Campaign-wide semantic search (#599): "find my thing" across the DM's own
 * NPCs, locations, factions, notes, quests, items and monsters, by meaning
 * rather than by exact keyword.
 *
 * WHY IT EXISTS. It is an index over the DM's own writing. It generates
 * nothing, so there is no hallucination surface: every hit is a row the DM
 * (or the shared library) already holds, ranked by embedding distance. The
 * corpora and match RPCs are the ones the generators already use (#595, #600,
 * #602); quests joined with this feature.
 *
 * WHY DM-ONLY. The service-role reads below bypass RLS and return DM-only
 * material (backstories, quest beats), so the function itself decides who may
 * ask: the campaign's owner or a `dm` member (isCampaignDm). A player calling
 * it directly gets a 403.
 *
 * WHY PLAYER-AUTHORED TABLES ARE NEVER INDEXED. entity_notes,
 * player_journal_entries and npc_player_notes have a data subject who is not
 * the account holder, and the DM cannot consent on a player's behalf.
 * npc_player_notes are also per-player, so indexing them into a DM-facing
 * search would leak one player's private speculation through the search layer.
 *
 * WHY PRO-ONLY. Search by meaning is a Pro feature of the caller's own
 * account (is_user_pro: Pro, tester or admin, never a child); every plan keeps
 * keyword search. It is not priced in credits: a search costs a fraction of a
 * cent and charging a search box as the DM types would be absurd, so the plan
 * is the gate instead. This does not contradict "never gate AI generation on
 * Pro" (generation spends credits on every plan): nothing is generated here.
 * `is_user_pro` fails closed, so a failed check answers `pro_only`.
 *
 * WHY IT DOES NOT GATE ON `ai_enabled`. embed-on-write already embeds the
 * campaign's content whatever that flag says, and the query is the DM's own
 * text. Nothing is generated and no model reads the DM's prose here: the only
 * provider call is one embedding of the query. The flag governs generation,
 * and this is not generation.
 *
 * EVERY DEGRADATION ANSWERS 200 with `unavailable` (child account, not Pro,
 * no embedding provider, rate limited) so the client falls back to keyword search
 * silently instead of reporting an error. Only a malformed request, a missing
 * token, a wrong campaign, a provider failure or a total retrieval failure are
 * non-200.
 *
 * Accounting: the query embedding is recorded as a 0-credit "campaign_search"
 * generation (seeded by the #599 migration), rate limited on its own
 * `campaign_search` bucket BEFORE the provider is called.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MATCH_COUNT = 8;
const RERANK_TIMEOUT_MS = 6_000;

interface SearchCampaign extends BaseCampaign {
  game_system: string | null;
}

function unavailable(reason: CampaignSearchUnavailable): Response {
  const body: CampaignSearchResponse = { hits: [], unavailable: reason };
  return json(body);
}

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
      console.error(`search-campaign: ${kind} match failed:`, error.message);
      return { kind, hits: [], failed: true };
    }
    return { kind, hits: ((data ?? []) as Record<string, unknown>[]).map(toHit), failed: false };
  } catch (e) {
    console.error(`search-campaign: ${kind} match threw:`, e);
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

/**
 * The text of each pooled hit, keyed by hitKey. One read per table, by id (the
 * ids came out of the campaign-scoped match RPCs). A table that cannot be read
 * is logged and its hits are judged by name and descriptor alone.
 */
async function loadEntries(pool: CampaignSearchHit[]): Promise<Map<string, EntryFields>> {
  const groups = new Map<string, { select: string; ids: string[] }>();
  for (const hit of pool) {
    const source = rowSourceFor(hit.kind);
    if (source === null) continue;
    const group = groups.get(source.table) ?? { select: source.select, ids: [] };
    group.ids.push(hit.id);
    groups.set(source.table, group);
  }

  const rows = new Map<string, Record<string, unknown>>();
  await Promise.all([...groups.entries()].map(async ([table, group]) => {
    const { data, error } = await admin.from(table).select(group.select).in("id", group.ids);
    if (error) {
      console.error(`search-campaign: ${table} text read failed:`, error.message);
      return;
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (typeof row.id === "string") rows.set(`${table}:${row.id}`, row);
    }
  }));

  const entries = new Map<string, EntryFields>();
  for (const hit of pool) {
    const source = rowSourceFor(hit.kind);
    entries.set(hitKey(hit), buildEntry(hit, source === null ? undefined : rows.get(`${source.table}:${hit.id}`)));
  }
  return entries;
}

serve(serveUser(async ({ user, req }) => {
  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "Invalid JSON body.");
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 200) {
    return jsonError(400, "invalid_body", "A search needs 2 to 200 characters.");
  }
  const campaignId = body.campaign_id;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    return jsonError(400, "invalid_body", "campaign_id must be a uuid.");
  }

  // Not `generationRefusal`: a child account is answered 200 `unavailable` so the client falls back to keyword search
  // instead of showing an error, and a failed child lookup is refused, not waved through, because embedding is free
  // and no credit or Pro check would stop a child's text reaching the provider.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();
  let child = false;
  try {
    child = await isChildAccount(admin, user.id);
  } catch (e) {
    console.error("search-campaign: child-account check failed:", e);
    return jsonError(503, "account_check_failed");
  }
  if (child) return unavailable("child_account");

  // The AI switch is not checked here: embedding the query is search, and only the rerank below needs AI on.
  const load = await loadAiCampaign<SearchCampaign>(admin, campaignId, user.id, {
    columns: ["game_system"],
    aiSwitch: false,
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Before the provider and the rate limit, so a free account costs nothing.
  if (!(await isUserPro(admin, user.id))) return unavailable("pro_only");

  // Same platform provider resolution as embed-content. A config problem is an
  // expected degradation here, not an error the client should report.
  let provider;
  try {
    const platformKeys = await fetchPlatformKeys(admin, ["openai", "gemini"]);
    provider = await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
  } catch (e) {
    if (e instanceof EmbeddingProviderConfigError) {
      console.error("search-campaign: embedding provider unavailable:", e.message);
      return unavailable("embedding_provider_unavailable");
    }
    throw e;
  }

  // Before the embed, so a limited caller costs nothing.
  if (!(await checkRateLimit(admin, user.id, "campaign_search"))) return unavailable("rate_limited");

  let vector: string;
  try {
    const { vectors, usage } = await provider.embed([query]);
    vector = toVectorLiteral(vectors[0]);
    await recordFreeGeneration(admin, user.id, "campaign_search", {
      model: provider.model,
      provider: usage.provider,
      input_tokens: usage.input_tokens,
    });
  } catch (e) {
    console.error("search-campaign: query embed failed:", e);
    return jsonError(502, "embedding_failed", e instanceof Error ? e.message : "Embedding failed");
  }

  // Same source derivation as generate-loot / generate-encounter. A Generic
  // campaign has no edition and no 5e monster or library content, so those
  // searches are skipped (never scoped to a fabricated 2014). An unreadable source list drops the library sides
  // (logged) rather than failing the search; it is never read as "none enabled".
  const ruleset = gameSystemEdition(campaign.game_system);
  const ownerId = campaign.user_id as string;
  const model = provider.model;
  // Only the library sides read the enabled sources, and a system with no edition has none.
  let enabledSlugs: string[] = [];
  if (ruleset) {
    const { data: enabledRows, error: enabledError } = await admin
      .from("campaign_enabled_sources")
      .select("source_slug")
      .eq("campaign_id", campaignId);
    if (enabledError) console.error("search-campaign: enabled sources lookup failed:", enabledError.message);
    else enabledSlugs = (enabledRows ?? []).map((r: { source_slug: string }) => r.source_slug);
  }

  const scope = { p_campaign_id: campaignId, p_owner_id: ownerId, p_embedding_model: model };

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
  if (results.every((r) => r.failed)) {
    return jsonError(500, "search_failed", "Search failed. Please try again.");
  }

  const allHits = results.flatMap((r) => r.hits);
  let hits = rankSearchHits(allHits);

  // The rerank is an enhancement: nothing in it may fail the search.
  try {
    const pool = rerankPool(allHits);
    let apiKey: string | null = null;
    if (campaign.ai_enabled === true && pool.length > 0) {
      apiKey = judgingKey(campaign.ai_enabled, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
    }
    if (apiKey !== null) {
      const key = apiKey;
      const entries = await loadEntries(pool);
      const reranked = await rerankHits(query, pool, entries, async (request) => {
        const res = await judge(request, { apiKey: key, timeoutMs: RERANK_TIMEOUT_MS });
        const probabilities: Record<string, number | null> = {};
        for (const entryKey of Object.keys(request.questions)) probabilities[entryKey] = noulOf(res, entryKey);
        return { probabilities, inputTokens: res.inputTokens };
      });
      if (reranked.succeeded > 0) {
        await recordFreeGeneration(admin, user.id, "entity_judgment", {
          model: JEV_MODEL,
          provider: "typesafe",
          input_tokens: reranked.inputTokens,
        });
      }
      if (reranked.hits !== null) hits = reranked.hits;
    }
  } catch (e) {
    console.error("search-campaign: rerank failed, keeping distance order:", e instanceof Error ? e.message : "unknown error");
  }

  const response: CampaignSearchResponse = { hits };
  return json(response);
}));
