/**
 * Document-import dedupe candidates (#353 review-wizard rework).
 *
 * The importer used to create every extracted entity as a brand-new row, so a
 * page naming four NPCs the DM already had produced four duplicates. The
 * rebuilt review wizard shows the DM existing-row candidates per entity and
 * lets them choose Link / Create / Ignore, and this function is what produces
 * those candidates — two tiers, in order of confidence:
 *
 *   1. NAME (SQL, `match_import_entity_names` — migration 20260918141022):
 *      exact and whole-word-suffix matches against the DM's own campaign +
 *      global rows, plus the library where one exists. Cheap, exact, and
 *      never trims the DM's own rows — five goblins stay five candidates.
 *   2. MEANING (embeddings): a batched embed of every semantic-eligible
 *      entity's extracted text, matched against the same vector corpora the
 *      quest-hook generator (#600) and the loot generator (#602) already
 *      query. Appended after the name tier, capped, and dropped entirely on
 *      any failure — see the semantic-tier try/catch below.
 *
 * Auth + DM-gate shape is copied from import-extract/index.ts: anon client
 * with the caller's own Authorization header to derive `auth.uid()`, then the
 * admin (service-role) client for everything else, because both
 * `match_import_entity_names` and the vector-search RPCs are service-role
 * only. This function does not spend the DM's credits — the embedding call is
 * platform-paid and recorded via `recordFreeGeneration`, the same shape
 * generate-quest's own retrieval step uses — and it does not require
 * `ai_enabled`: dedupe is not generation, it is "does this already exist,"
 * and gating it behind the AI toggle would strand a DM who has AI disabled
 * with nothing but duplicate rows on every import.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import {
  EmbeddingProviderConfigError,
  resolveEmbeddingProvider,
  toVectorLiteral,
} from "../_shared/embeddings.ts";
import {
  buildQueryText,
  isSemanticKind,
  mergeCandidates,
  factionDetail,
  itemDetail,
  locationDetail,
  monsterDetail,
  npcDetail,
  PayloadValidationError,
  SIMILAR_MAX_DISTANCE,
  SUPPORTED_KINDS,
  validatePayload,
  type Candidate,
  type MatchKind,
  type MatchSource,
  type SemanticFactionRow,
  type SemanticItemRow,
  type SemanticKind,
  type SemanticLocationRow,
  type SemanticMonsterRow,
  type SemanticNpcRow,
  type SupportedKind,
} from "./matching.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Name tier ─────────────────────────────────────────────────────────────────

interface NameMatchRow {
  query_name: string;
  target_id: string;
  source: string;
  matched_name: string;
  match_kind: string;
  detail: string | null;
}

/**
 * One `match_import_entity_names` call per kind present in the request — the
 * RPC itself batches every name of that kind in one query. Rows are grouped
 * by `query_name` (several refs can share a name, e.g. three "Goblin"
 * entities on one page) and re-attached to every ref that asked for it.
 */
async function fetchNameMatches(
  userId: string,
  campaignId: string,
  kind: SupportedKind,
  names: string[],
): Promise<Map<string, Candidate[]>> {
  const { data, error } = await admin.rpc("match_import_entity_names", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_kind: kind,
    p_names: names,
  });
  if (error) throw new Error(`match_import_entity_names(${kind}): ${error.message}`);

  const byName = new Map<string, Candidate[]>();
  for (const row of (data ?? []) as NameMatchRow[]) {
    const list = byName.get(row.query_name) ?? [];
    list.push({
      targetId: row.target_id,
      source: row.source as MatchSource,
      name: row.matched_name,
      matchKind: row.match_kind as MatchKind,
      detail: row.detail,
      distance: null,
    });
    byName.set(row.query_name, list);
  }
  return byName;
}

// ── Semantic tier ────────────────────────────────────────────────────────────

const SEMANTIC_MATCH_COUNT = 5;

interface RetrievalContext {
  campaignId: string;
  /** campaigns.user_id — the owner whose global rows are in scope, never the caller. */
  ownerId: string;
  embeddingModel: string;
  /** "2014" | "2024" — derived the same way generate-encounter derives it. */
  ruleset: string;
  /** campaign_enabled_sources.source_slug rows, for the library side of monsters/items. */
  enabledSlugs: string[];
}

function toSimilarCandidate(
  source: MatchSource,
  id: string,
  name: string,
  detail: string | null,
  distance: number,
): Candidate {
  return { targetId: id, source, name, matchKind: "similar", detail, distance };
}

/**
 * One entity's embedding-tier candidates for its kind, already filtered to
 * `SIMILAR_MAX_DISTANCE[kind]` and shaped into `Candidate`s. Throws on any
 * RPC error — the caller wraps the whole semantic tier in one try/catch, same
 * "an enhancement, never a requirement" contract every retrieval-backed
 * generator in this codebase already follows (generate-quest, generate-loot,
 * generate-encounter's complication pass).
 */
async function fetchSimilarCandidates(
  kind: SemanticKind,
  queryVector: string,
  ctx: RetrievalContext,
): Promise<Candidate[]> {
  const maxDistance = SIMILAR_MAX_DISTANCE[kind];

  if (kind === "npcs") {
    const { data, error } = await admin.rpc("match_campaign_npcs", {
      query_embedding: queryVector,
      p_campaign_id: ctx.campaignId,
      p_owner_id: ctx.ownerId,
      p_embedding_model: ctx.embeddingModel,
      match_count: SEMANTIC_MATCH_COUNT,
    });
    if (error) throw new Error(`match_campaign_npcs: ${error.message}`);
    return ((data ?? []) as SemanticNpcRow[])
      .filter((r) => r.distance <= maxDistance)
      .map((r) => toSimilarCandidate("campaign", r.id, r.name, npcDetail(r), r.distance));
  }

  if (kind === "factions") {
    const { data, error } = await admin.rpc("match_campaign_factions", {
      query_embedding: queryVector,
      p_campaign_id: ctx.campaignId,
      p_owner_id: ctx.ownerId,
      p_embedding_model: ctx.embeddingModel,
      match_count: SEMANTIC_MATCH_COUNT,
    });
    if (error) throw new Error(`match_campaign_factions: ${error.message}`);
    return ((data ?? []) as SemanticFactionRow[])
      .filter((r) => r.distance <= maxDistance)
      .map((r) => toSimilarCandidate("campaign", r.id, r.name, factionDetail(r), r.distance));
  }

  if (kind === "locations") {
    const { data, error } = await admin.rpc("match_campaign_locations", {
      query_embedding: queryVector,
      p_campaign_id: ctx.campaignId,
      p_owner_id: ctx.ownerId,
      p_embedding_model: ctx.embeddingModel,
      match_count: SEMANTIC_MATCH_COUNT,
    });
    if (error) throw new Error(`match_campaign_locations: ${error.message}`);
    return ((data ?? []) as SemanticLocationRow[])
      .filter((r) => r.distance <= maxDistance)
      .map((r) => toSimilarCandidate("campaign", r.id, r.name, locationDetail(r), r.distance));
  }

  if (kind === "monsters") {
    const [customRes, libraryRes] = await Promise.all([
      admin.rpc("match_custom_monsters", {
        query_embedding: queryVector,
        p_campaign_id: ctx.campaignId,
        p_owner_id: ctx.ownerId,
        p_ruleset: ctx.ruleset,
        p_embedding_model: ctx.embeddingModel,
        match_count: SEMANTIC_MATCH_COUNT,
      }),
      // Skipped entirely with no enabled sources — never called with an empty
      // array, same reasoning as monsterRetrieval.ts: a loosened predicate
      // would leak content from books this campaign has not turned on.
      ctx.enabledSlugs.length > 0
        ? admin.rpc("match_library_monsters", {
          query_embedding: queryVector,
          source_slugs: ctx.enabledSlugs,
          p_ruleset: ctx.ruleset,
          p_embedding_model: ctx.embeddingModel,
          match_count: SEMANTIC_MATCH_COUNT,
        })
        : Promise.resolve({ data: [] as SemanticMonsterRow[], error: null }),
    ]);
    if (customRes.error) throw new Error(`match_custom_monsters: ${customRes.error.message}`);
    if (libraryRes.error) throw new Error(`match_library_monsters: ${libraryRes.error.message}`);

    const custom = ((customRes.data ?? []) as SemanticMonsterRow[])
      .filter((r) => r.distance <= maxDistance)
      .map((r) => toSimilarCandidate("campaign", r.id, r.name, monsterDetail(r), r.distance));
    const library = ((libraryRes.data ?? []) as SemanticMonsterRow[])
      .filter((r) => r.distance <= maxDistance)
      .map((r) => toSimilarCandidate("library", r.id, r.name, monsterDetail(r), r.distance));
    return [...custom, ...library];
  }

  // kind === "items"
  const [customRes, libraryRes] = await Promise.all([
    admin.rpc("match_custom_items", {
      query_embedding: queryVector,
      p_campaign_id: ctx.campaignId,
      p_owner_id: ctx.ownerId,
      p_rarities: [],
      p_exclude_attunement: false,
      p_embedding_model: ctx.embeddingModel,
      match_count: SEMANTIC_MATCH_COUNT,
    }),
    admin.rpc("match_library_items", {
      query_embedding: queryVector,
      // 'grimoire-bundled' is edition-neutral bundled gear, always visible --
      // same list generate-loot passes, matching fetchLibraryItems()'s
      // .in() call in useItems.ts exactly.
      source_keys: ["grimoire-bundled", ...ctx.enabledSlugs],
      p_ruleset: ctx.ruleset,
      p_rarities: [],
      p_exclude_attunement: false,
      p_embedding_model: ctx.embeddingModel,
      match_count: SEMANTIC_MATCH_COUNT,
    }),
  ]);
  if (customRes.error) throw new Error(`match_custom_items: ${customRes.error.message}`);
  if (libraryRes.error) throw new Error(`match_library_items: ${libraryRes.error.message}`);

  const custom = ((customRes.data ?? []) as SemanticItemRow[])
    .filter((r) => r.distance <= maxDistance)
    .map((r) => toSimilarCandidate("campaign", r.id, r.name, itemDetail(r), r.distance));
  const library = ((libraryRes.data ?? []) as SemanticItemRow[])
    .filter((r) => r.distance <= maxDistance)
    .map((r) => toSimilarCandidate("library", r.id, r.name, itemDetail(r), r.distance));
  return [...custom, ...library];
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });
  const userId = user.id;

  if (await isAccountSuspended(admin, userId)) return suspendedResponse();

  let payload: ReturnType<typeof validatePayload>;
  try {
    const body = await req.json().catch(() => null);
    payload = validatePayload(body);
  } catch (e) {
    const message = e instanceof PayloadValidationError ? e.message : "Invalid request body.";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Ownership re-derived from auth.uid() via an explicit filter, never trusted
  // from the request -- same reasoning as import-extract.
  const { data: importRow } = await admin
    .from("document_imports")
    .select("id, campaign_id")
    .eq("id", payload.documentImportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!importRow) return new Response("Import not found", { status: 404 });

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ruleset")
    .eq("id", importRow.campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  // DM specifically, not any member -- an import writes into every content
  // table, so producing candidates for one is DM-scoped work, same gate
  // import-extract itself uses.
  if (campaign.user_id !== userId) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", importRow.campaign_id).eq("user_id", userId).eq("role", "dm").maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // Bounds both tiers below: the name tier is cheap SQL, but the semantic
  // tier makes a real, platform-paid embedding call, and without a limiter
  // here a looping caller runs up unbounded platform spend with no credit
  // reservation to catch it (the same reasoning generate-quest's own
  // retrieval step documents -- see its "Pre-flight credit check" comment).
  if (!(await checkRateLimit(admin, userId, "ai_generation"))) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }

  // ── Name tier ────────────────────────────────────────────────────────────
  const matches: Partial<Record<SupportedKind, Record<string, Candidate[]>>> = {};

  try {
    for (const kind of SUPPORTED_KINDS) {
      const entities = payload.byKind[kind];
      if (!entities || entities.length === 0) continue;

      const names = [...new Set(entities.map((e) => e.name))];
      const byName = await fetchNameMatches(userId, campaign.id, kind, names);

      for (const entity of entities) {
        const candidates = byName.get(entity.name);
        if (!candidates || candidates.length === 0) continue;
        (matches[kind] ??= {})[entity.ref] = candidates;
      }
    }
  } catch (e) {
    console.error(`import-match name tier failed for import ${payload.documentImportId}:`, e);
    return new Response(JSON.stringify({ error: "Name matching failed." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // ── Semantic tier -- an enhancement, never a requirement ────────────────────
  // Any failure here (no embedding provider configured, a transient RPC
  // error, ...) degrades to the name tier alone with `semantic: false`, the
  // same "retrieval never takes the feature down" contract generate-quest,
  // generate-loot and generate-encounter's complication pass all apply.
  let semantic = false;
  try {
    const semanticEntities: { kind: SemanticKind; ref: string; name: string; data: Record<string, unknown> }[] = [];
    for (const kind of SUPPORTED_KINDS) {
      if (!isSemanticKind(kind)) continue;
      const entities = payload.byKind[kind];
      if (!entities) continue;
      for (const entity of entities) {
        semanticEntities.push({ kind, ref: entity.ref, name: entity.name, data: entity.data });
      }
    }

    if (semanticEntities.length > 0) {
      const platformKeys = await fetchPlatformKeys(admin, ["openai", "gemini"]);
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });

      const texts = semanticEntities.map((e) => buildQueryText(e.kind, e.name, e.data));
      const { vectors, usage } = await embedProvider.embed(texts);

      // Recorded immediately after embed() returns -- real provider spend was
      // incurred the moment it resolved, and everything below can still
      // throw into this catch. Platform-paid, charged to nobody: is_byok
      // stays false because we paid for it, not the DM (recordFreeGeneration's
      // own doc comment; same placement generate-quest uses).
      await recordFreeGeneration(admin, userId, "entity_embedding", {
        model: embedProvider.model,
        provider: usage.provider,
        input_tokens: usage.input_tokens,
      });

      const needsMonsterOrItem = semanticEntities.some((e) => e.kind === "monsters" || e.kind === "items");
      let ruleset = "2014";
      let enabledSlugs: string[] = [];
      if (needsMonsterOrItem) {
        // Same derivation generate-encounter uses -- ruleset is a two-value
        // enum on the campaign, everything else collapses to "2014".
        ruleset = campaign.ruleset === "2024" ? "2024" : "2014";
        const { data: enabledSourceRows, error: enabledSourceError } = await admin
          .from("campaign_enabled_sources")
          .select("source_slug")
          .eq("campaign_id", campaign.id);
        if (enabledSourceError) throw new Error(enabledSourceError.message);
        enabledSlugs = (enabledSourceRows ?? []).map((r: { source_slug: string }) => r.source_slug);
      }

      const ctx: RetrievalContext = {
        campaignId: campaign.id,
        ownerId: campaign.user_id,
        embeddingModel: embedProvider.model,
        ruleset,
        enabledSlugs,
      };

      for (let i = 0; i < semanticEntities.length; i++) {
        const entity = semanticEntities[i];
        const queryVector = toVectorLiteral(vectors[i]);
        const similar = await fetchSimilarCandidates(entity.kind, queryVector, ctx);
        if (similar.length === 0) continue;

        const kindMatches = (matches[entity.kind] ??= {});
        kindMatches[entity.ref] = mergeCandidates(kindMatches[entity.ref] ?? [], similar);
      }

      semantic = true;
    } else {
      // Nothing to embed (every entity was a kind with no semantic corpus) --
      // not a failure, just nothing for this tier to add.
      semantic = true;
    }
  } catch (e) {
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.error(`import-match semantic tier unavailable for import ${payload.documentImportId}: ${why}`);
    semantic = false;
  }

  return new Response(JSON.stringify({ matches, semantic }), {
    headers: { "Content-Type": "application/json" },
  });
}));
