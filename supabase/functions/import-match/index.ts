/**
 * Document-import dedupe candidates (#353 review-wizard rework).
 *
 * The importer used to create every extracted entity as a brand-new row, so a
 * page naming four NPCs the DM already had produced four duplicates. The
 * rebuilt review wizard shows the DM existing-row candidates per entity and
 * lets them choose Link / Create / Ignore, and this function is what produces
 * those candidates — two tiers, in order of confidence:
 *
 *   1. NAME (SQL, `match_import_entity_names` — migration 20260918141022,
 *      widened by 20261002131333): exact, one-keystroke-away and whole-word
 *      partial matches against the DM's own campaign + global rows, plus the
 *      library where one exists. Cheap, and never trims the DM's own rows —
 *      five goblins stay five candidates. This tier carries every NAME
 *      difference on its own; the tier below compares descriptions and does
 *      not rescue a misspelling or a missing surname.
 *   2. MEANING (embeddings): a batched embed of every semantic-eligible
 *      entity's extracted text, matched against the same vector corpora the
 *      quest-hook generator (#600) and the loot generator (#602) already
 *      query. Appended after the name tier, capped, and dropped entirely on
 *      any failure — see the semantic-tier try/catch below.
 *   3. JUDGMENT (Jev, TypeSafe, #1061): a distance cannot tell "the same
 *      innkeeper, described differently" from "the innkeeper's brother", so
 *      when the tier below is available the meaning tier keeps its five
 *      nearest rows per RPC WITHOUT the distance cut-off and every
 *      (imported, existing) pair, name candidates first, up to 8 per entity,
 *      is scored 0 to 2 by Jev (`Candidate.verdict`). A similar candidate
 *      under 0.5 is dropped, a name candidate never is, and candidates are
 *      ordered best verdict first. A pair that fails, times out (the whole
 *      tier has 45 s) or is over a cap is left unjudged and falls back to the
 *      distance rule, so this tier can only improve on tier 2, never break it.
 *      Pure parts live in judging.ts and judgeTier.ts.
 *
 * Auth + DM-gate shape is copied from import-extract/index.ts: anon client
 * with the caller's own Authorization header to derive `auth.uid()`, then the
 * admin (service-role) client for everything else, because both
 * `match_import_entity_names` and the vector-search RPCs are service-role
 * only. This function does not spend the DM's credits — the embedding call is
 * platform-paid and recorded via `recordFreeGeneration`, the same shape
 * generate-quest's own retrieval step uses — and it does not require
 * `ai_enabled` for tiers 1 and 2: dedupe is not generation, it is "does this
 * already exist," and gating it behind the AI toggle would strand a DM who has
 * AI disabled with nothing but duplicate rows on every import. Tier 3 does
 * respect it: a Jev verdict is a model judgment of the DM's campaign text sent
 * to a third party, so it runs only when `ai_enabled` is true, a `typesafe`
 * platform key exists and tier 2 ran. With AI off the importer behaves exactly
 * as before (every verdict null, `judged: false`). Like the embedding call it
 * is platform-paid and recorded through `recordFreeGeneration`
 * ("entity_judgment").
 */
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { judge, JEV_MODEL, judgingKey, scoreOf } from "../_shared/typesafe.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import {
  EmbeddingProviderConfigError,
  resolveEmbeddingProvider,
  toVectorLiteral,
} from "../_shared/embeddings.ts";
import {
  applyVerdicts,
  buildPool,
  judgeTable,
  JUDGE_ROW_SELECT,
  RELATION_QUESTION,
} from "./judging.ts";
import { runJudgingTier, type TierEntity } from "./judgeTier.ts";
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
      verdict: null,
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
  /** The campaign system's 5e edition; undefined for Generic, which has no monster or item library (#934). */
  ruleset: string | undefined;
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
  return { targetId: id, source, name, matchKind: "similar", detail, distance, verdict: null };
}

/**
 * One entity's embedding-tier candidates for its kind, filtered to
 * `SIMILAR_MAX_DISTANCE[kind]` (unless `cutoff` is false, when the judging tier
 * will decide, and every nearest row is returned with its distance) and shaped
 * into `Candidate`s. Throws on any
 * RPC error — the caller wraps the whole semantic tier in one try/catch, same
 * "an enhancement, never a requirement" contract every retrieval-backed
 * generator in this codebase already follows (generate-quest, generate-loot,
 * generate-encounter's complication pass).
 */
async function fetchSimilarCandidates(
  kind: SemanticKind,
  queryVector: string,
  ctx: RetrievalContext,
  cutoff: boolean,
): Promise<Candidate[]> {
  const maxDistance = cutoff ? SIMILAR_MAX_DISTANCE[kind] : Number.POSITIVE_INFINITY;

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

  // Generic campaign: no 5e monsters or items exist to match against, so there
  // is nothing to suggest (never a fabricated 2014 scope).
  if ((kind === "monsters" || kind === "items") && !ctx.ruleset) return [];

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

interface MatchCampaign extends BaseCampaign {
  game_system: string | null;
}

serve(serveUser(async ({ user, req }) => {
  const userId = user.id;

  // Fail closed: the semantic tier embeds for free, so no credit or Pro check
  // further down would stop a child whose status could not be read.
  const accountRefusal = await generationRefusal(admin, userId, { failClosed: true });
  if (accountRefusal) return accountRefusal;

  let payload: ReturnType<typeof validatePayload>;
  try {
    const body = await readJsonBody(req);
    payload = validatePayload(body);
  } catch (e) {
    const message = e instanceof PayloadValidationError ? e.message : "Invalid request body.";
    return jsonError(400, "invalid_body", message);
  }

  // Ownership re-derived from auth.uid() via an explicit filter, never trusted
  // from the request -- same reasoning as import-extract.
  const { data: importRow, error: importError } = await admin
    .from("document_imports")
    .select("id, campaign_id")
    .eq("id", payload.documentImportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (importError) throw importError;
  if (!importRow) return jsonError(404, "import_not_found", "Import not found.");

  // DM specifically, not any member -- an import writes into every content
  // table, so producing candidates for one is DM-scoped work, same gate
  // import-extract itself uses. `ai_enabled` does not gate this request (name
  // and meaning tiers are dedupe, not generation), so the AI switch is off here
  // and read below, where it gates only the judging tier.
  const load = await loadAiCampaign<MatchCampaign>(admin, importRow.campaign_id, userId, {
    columns: ["game_system"],
    aiSwitch: false,
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Bounds both tiers below: the name tier is cheap SQL, but the semantic
  // tier makes a real, platform-paid embedding call, and without a limiter
  // here a looping caller runs up unbounded platform spend with no credit
  // reservation to catch it (the same reasoning generate-quest's own
  // retrieval step documents -- see its "Pre-flight credit check" comment).
  if (!(await checkRateLimit(admin, userId, "ai_generation"))) return rateLimited();

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
    return jsonError(500, "name_matching_failed", "Name matching failed. Please try again.");
  }

  // ── Semantic tier -- an enhancement, never a requirement ────────────────────
  // Any failure here (no embedding provider configured, a transient RPC
  // error, ...) degrades to the name tier alone with `semantic: false`, the
  // same "retrieval never takes the feature down" contract generate-quest,
  // generate-loot and generate-encounter's complication pass all apply.
  let semantic = false;
  let judged = false;

  // Judging needs AI on and a key; resolved before the embeddings are fetched
  // because it decides whether the meaning tier keeps its distance cut-off. A
  // failed key read means no judging, never a failed import.
  let jevKey: string | null = null;
  if (campaign.ai_enabled === true) {
    try {
      jevKey = judgingKey(campaign.ai_enabled, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
    } catch (e) {
      console.error(`import-match could not read the typesafe key for import ${payload.documentImportId}:`, e);
    }
  }
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
      const ruleset = gameSystemEdition(campaign.game_system);
      let enabledSlugs: string[] = [];
      if (needsMonsterOrItem && ruleset) {
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

      const toJudge: (TierEntity & { ref: string })[] = [];
      for (let i = 0; i < semanticEntities.length; i++) {
        const entity = semanticEntities[i];
        const queryVector = toVectorLiteral(vectors[i]);
        const similar = await fetchSimilarCandidates(entity.kind, queryVector, ctx, jevKey === null);

        if (jevKey !== null) {
          const pool = buildPool(matches[entity.kind]?.[entity.ref] ?? [], similar);
          if (pool.length > 0) {
            toJudge.push({ key: `${entity.kind}:${entity.ref}`, ref: entity.ref, kind: entity.kind, importedText: texts[i], pool });
          }
          continue;
        }
        if (similar.length === 0) continue;

        const kindMatches = (matches[entity.kind] ??= {});
        kindMatches[entity.ref] = mergeCandidates(kindMatches[entity.ref] ?? [], similar);
      }

      semantic = true;

      if (jevKey !== null) {
        const apiKey = jevKey;
        judged = true;
        let verdicts = new Map<string, number>();
        try {
          const tier = await runJudgingTier(toJudge, {
            loadRows: async (kind, source, ids) => {
              const table = judgeTable(kind, source);
              if (!table) return new Map();
              const { data, error } = await admin.from(table).select(JUDGE_ROW_SELECT[kind]).in("id", ids);
              if (error) throw new Error(`${table}: ${error.message}`);
              const byId = new Map<string, Record<string, unknown>>();
              for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
                if (typeof row.id === "string") byId.set(row.id, row);
              }
              return byId;
            },
            judgePair: async (request, signal) => {
              const res = await judge(request, { apiKey, signal });
              return { score: scoreOf(res, RELATION_QUESTION), model: res.model, inputTokens: res.inputTokens };
            },
          });
          verdicts = tier.verdicts;
          // Recorded as soon as the tier returns: the tokens were spent, and
          // nothing after this line may lose the row.
          if (tier.judged > 0) {
            await recordFreeGeneration(admin, userId, "entity_judgment", {
              model: JEV_MODEL,
              provider: "typesafe",
              input_tokens: tier.inputTokens,
            });
          }
        } catch (e) {
          // Judging is an enhancement: whatever is missing is unjudged and
          // takes the distance rule below.
          console.error(`import-match judging tier failed for import ${payload.documentImportId}:`, e instanceof Error ? e.message : "unknown error");
        }

        for (const entity of toJudge) {
          const candidates = applyVerdicts(entity.kind, entity.key, entity.pool, verdicts);
          if (candidates.length > 0) (matches[entity.kind] ??= {})[entity.ref] = candidates;
        }
      }
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

  return json({ matches, semantic, judged });
}));
