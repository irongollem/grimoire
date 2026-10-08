import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, isChildAccount, suspendedResponse } from "../_shared/accountGate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { EmbeddingProviderConfigError, resolveEmbeddingProvider, toVectorLiteral } from "../_shared/embeddings.ts";
import {
  NOTE_CATEGORIES,
  rankSearchHits,
  type CampaignSearchHit,
  type CampaignSearchKind,
  type CampaignSearchResponse,
  type CampaignSearchUnavailable,
} from "../_shared/campaignSearch.ts";

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
 * WHY IT DOES NOT GATE ON `ai_enabled`. embed-on-write already embeds the
 * campaign's content whatever that flag says, and the query is the DM's own
 * text. Nothing is generated and no model reads the DM's prose here: the only
 * provider call is one embedding of the query. The flag governs generation,
 * and this is not generation.
 *
 * EVERY DEGRADATION ANSWERS 200 with `unavailable` (child account, no
 * embedding provider, rate limited) so the client falls back to keyword search
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  let body: { query?: unknown; campaign_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 200) {
    return json({ error: "query must be 2 to 200 characters" }, 400);
  }
  const campaignId = body.campaign_id;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    return json({ error: "campaign_id must be a uuid" }, 400);
  }

  // Identity comes only from the verified bearer token.
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  // A failed lookup is refused, not waved through: embedding is free, so no
  // credit or Pro check would stop a child's text reaching the provider.
  let child = false;
  try {
    child = await isChildAccount(admin, user.id);
  } catch (e) {
    console.error("search-campaign: child-account check failed:", e);
    return json({ error: "account_check_failed" }, 503);
  }
  if (child) return unavailable("child_account");

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, user_id, ruleset")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error("search-campaign: campaign lookup failed:", campaignError.message);
    return json({ error: "Failed to load campaign" }, 500);
  }
  if (!campaign) return json({ error: "Campaign not found" }, 404);

  try {
    if (!(await isCampaignDm(admin, campaign, user.id))) return json({ error: "Forbidden" }, 403);
  } catch (e) {
    console.error("search-campaign: DM check failed:", e);
    return json({ error: "Failed to check campaign access" }, 500);
  }

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
    return json({ error: e instanceof Error ? e.message : "Embedding failed" }, 502);
  }

  // Same ruleset normalisation and source derivation as generate-loot /
  // generate-encounter. An unreadable source list drops the library sides
  // (logged) rather than failing the search; it is never read as "none enabled".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";
  const ownerId = campaign.user_id as string;
  const model = provider.model;
  const { data: enabledRows, error: enabledError } = await admin
    .from("campaign_enabled_sources")
    .select("source_slug")
    .eq("campaign_id", campaignId);
  if (enabledError) console.error("search-campaign: enabled sources lookup failed:", enabledError.message);
  const enabledSlugs = enabledError
    ? []
    : (enabledRows ?? []).map((r: { source_slug: string }) => r.source_slug);

  const scope = { p_campaign_id: campaignId, p_owner_id: ownerId, p_embedding_model: model };

  const jobs: Promise<RpcResult>[] = [
    runMatch("npc", admin.rpc("match_campaign_npcs", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("npc", "name", (r) => (r.occupation as string | null) ?? null)),
    runMatch("location", admin.rpc("match_campaign_locations", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("location", "name", (r) => (r.location_type as string | null) ?? null)),
    runMatch("faction", admin.rpc("match_campaign_factions", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("faction", "name", (r) => (r.faction_type as string | null) ?? null)),
    runMatch("note", admin.rpc("match_campaign_notes", {
      query_embedding: vector, ...scope, p_exclude_id: null, p_categories: [...NOTE_CATEGORIES], match_count: MATCH_COUNT,
    }), simple("note", "title", (r) =>
      typeof r.session_num === "number" ? `Session ${r.session_num}` : ((r.category as string | null) ?? null))),
    runMatch("quest", admin.rpc("match_campaign_quests", { query_embedding: vector, ...scope, match_count: MATCH_COUNT }),
      simple("quest", "title", (r) => (r.status as string | null) ?? null)),
    runMatch("item", admin.rpc("match_custom_items", {
      query_embedding: vector, ...scope, p_rarities: [], p_exclude_attunement: false, match_count: MATCH_COUNT,
    }), simple("item", "name", itemDescriptor)),
    runMatch("monster", admin.rpc("match_custom_monsters", {
      query_embedding: vector, ...scope, p_ruleset: ruleset, match_count: MATCH_COUNT,
    }), simple("monster", "name", monsterDescriptor)),
  ];

  // Library sides only when sources are enabled -- never called with an empty
  // array, which would loosen the predicate (the #567/#583 licensing mistake).
  if (enabledSlugs.length > 0) {
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
    return json({ error: "Search failed" }, 500);
  }

  const response: CampaignSearchResponse = { hits: rankSearchHits(results.flatMap((r) => r.hits)) };
  return json(response);
}));
