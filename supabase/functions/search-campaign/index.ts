import { retrieveCampaignHits } from "../_shared/campaignRetrieval.ts";
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
  hitKey,
  rerankPool,
  type CampaignSearchHit,
  type CampaignSearchResponse,
  type CampaignSearchUnavailable,
} from "../_shared/campaignSearch.ts";
import { UUID_RE } from "../_shared/uuid.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";

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

const RERANK_TIMEOUT_MS = 6_000;

interface SearchCampaign extends BaseCampaign {
  game_system: string | null;
}

function unavailable(reason: CampaignSearchUnavailable): Response {
  const body: CampaignSearchResponse = { hits: [], unavailable: reason };
  return json(body);
}

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

  const retrieved = await retrieveCampaignHits(admin, {
    campaignId,
    ownerId: campaign.user_id as string,
    gameSystem: campaign.game_system,
    vector,
    model: provider.model,
  });
  if (retrieved.allFailed) {
    return jsonError(500, "search_failed", "Search failed. Please try again.");
  }

  const allHits = retrieved.allHits;
  let hits = retrieved.ranked;

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
