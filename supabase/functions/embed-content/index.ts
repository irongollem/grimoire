import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { buildFactionEmbedText, buildLocationEmbedText, buildNoteEmbedText, buildNpcEmbedText, entityEmbedHash } from "../_shared/entityEmbedText.ts";
import {
  EmbeddingProviderConfigError,
  isEmbeddingStale,
  resolveEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
  type EmbeddingUsage,
} from "../_shared/embeddings.ts";

/**
 * Embedding endpoint for #600 (grounding the quest-hook generator and the
 * Chronicler recap generator, and whatever follows them, in the DM's own
 * NPCs/factions/locations/notes) — the entity generalisation of
 * embed-monsters/index.ts (#595). Same two modes, same reasons, retargeted at
 * npc_embeddings / faction_embeddings / location_embeddings / note_embeddings
 * (created by the migrations alongside these stories) via the ENTITIES
 * registry below instead of embed-monsters' library/custom split. `note` was
 * added by the Chronicler's story (20260804000001) on top of the npc/faction/
 * location trio #600's quest-hook story introduced first (20260803000004) —
 * everything below this registry (single-mode ownership check, batch admin
 * scan) generalises across all four entity kinds without change:
 *
 *   mode: "batch"  — admin-gated backfill/repair for one entity kind at a
 *                    time, driven by repeated calls (see `remaining`).
 *   mode: "single" — embed-on-write for one of the caller's own npcs,
 *                    factions, locations, or notes, called fire-and-forget
 *                    after create/save.
 *
 * NOT CHARGED, BUT RECORDED: same accounting story as embed-monsters —
 * embedding is infrastructure for retrieval, not a user-facing generation in
 * its own right, so every provider call goes through `recordFreeGeneration()`
 * with delta 0 and the real model/provider/input_tokens, generation type
 * "entity_embedding" (must be seeded at 0 credits in
 * `ai_generation_credit_costs` by the side-table migration, same as
 * "monster_embedding" was for #595). is_byok stays false: the platform key
 * paid for this call, and platform-cost reporting filters BYOK rows out. A
 * call that wrote no ledger row would be invisible spend. Batch mode writes
 * ONE row per invocation (summed tokens across the whole batch), not one per
 * row. Single mode writes one row per actual embed, and none at all when the
 * unchanged-hash/model short-circuit fires.
 *
 * NO checkRateLimit: same rationale as embed-monsters. The shared
 * `ai_generation` bucket throttles expensive, user-visible generations —
 * spending it here would let ordinary NPC/faction/location/note editing
 * (mode: "single" fires on every save) exhaust a DM's generation budget for
 * something they didn't ask for and never see. The guards that DO apply
 * instead: auth + ownership (mode: "single" verifies row.user_id ===
 * auth.uid()), the unchanged-hash/model short-circuit below (most saves make
 * no provider call at all), and the per-entity quota that already caps how
 * many NPCs/factions/locations/notes a user can create.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ── Entity registry ──────────────────────────────────────────────────────

type EntityKind = "npc" | "faction" | "location" | "note";

interface EntityConfig {
  table: "npcs" | "factions" | "locations" | "notes";
  // Only the columns the entity's builder reads, plus id/user_id/updated_at
  // -- a plain `select("*")` would pull stat_block/portrait_url/map_pins/etc
  // for nothing, on every row, on every batch scan.
  select: string;
  sideTable: "npc_embeddings" | "faction_embeddings" | "location_embeddings" | "note_embeddings";
  /** FK column on the side table pointing back at the main table's id. */
  idColumn: "npc_id" | "faction_id" | "location_id" | "note_id";
  /**
   * Row -> embed text. Wraps the corresponding buildXEmbedText() with the
   * row->EmbeddableX field mapping, so every entry in this registry shares
   * one signature (Record<string, unknown> -> string) despite the four
   * builders taking four different, non-overlapping input shapes -- the
   * same reason embed-monsters' TARGET_CONFIG routes both its targets
   * through one shared row shape rather than typing `build` per-target.
   */
  build: (row: Record<string, unknown>) => string;
}

const ENTITIES: Record<EntityKind, EntityConfig> = {
  npc: {
    table: "npcs",
    select: "id, user_id, updated_at, name, race, occupation, alignment, tags, appearance, personality, backstory",
    sideTable: "npc_embeddings",
    idColumn: "npc_id",
    build: (row) =>
      buildNpcEmbedText({
        name: row.name as string,
        race: (row.race as string | null) ?? null,
        occupation: (row.occupation as string | null) ?? null,
        alignment: (row.alignment as string | null) ?? null,
        tags: row.tags as string[],
        appearance: (row.appearance as string | null) ?? null,
        personality: (row.personality as string | null) ?? null,
        backstory: (row.backstory as string | null) ?? null,
      }),
  },
  faction: {
    table: "factions",
    select: "id, user_id, updated_at, name, faction_type, alignment, tags, description",
    sideTable: "faction_embeddings",
    idColumn: "faction_id",
    build: (row) =>
      buildFactionEmbedText({
        name: row.name as string,
        faction_type: (row.faction_type as string | null) ?? null,
        alignment: (row.alignment as string | null) ?? null,
        tags: row.tags as string[],
        description: (row.description as string | null) ?? null,
      }),
  },
  location: {
    table: "locations",
    select: "id, user_id, updated_at, name, location_type, tags, player_summary, description",
    sideTable: "location_embeddings",
    idColumn: "location_id",
    build: (row) =>
      buildLocationEmbedText({
        name: row.name as string,
        location_type: row.location_type as string,
        tags: row.tags as string[],
        player_summary: (row.player_summary as string | null) ?? null,
        description: (row.description as string | null) ?? null,
      }),
  },
  note: {
    table: "notes",
    select: "id, user_id, campaign_id, updated_at, title, category, session_num, tags, content",
    sideTable: "note_embeddings",
    idColumn: "note_id",
    build: (row) =>
      buildNoteEmbedText({
        title: row.title as string,
        category: row.category as string,
        session_num: (row.session_num as number | null) ?? null,
        tags: row.tags as string[],
        content: (row.content as string | null) ?? null,
      }),
  },
};

function isEntityKind(value: unknown): value is EntityKind {
  return value === "npc" || value === "faction" || value === "location" || value === "note";
}

const DEFAULT_BATCH_LIMIT = 100;
const MAX_BATCH_LIMIT = 500;

function clampBatchLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_LIMIT;
  return Math.min(Math.floor(raw), MAX_BATCH_LIMIT);
}

interface StoredEmbeddingRow {
  source_hash: string;
  embedding_model: string;
}

// A plain .select() can be silently capped by the project's configured
// PostgREST max-rows setting -- explicit range-paginated reads are the only
// way to guarantee every row is seen regardless of that setting (same
// reasoning as embed-monsters' fetchAllSourceRows/fetchAllStoredMeta).
const PAGE_SIZE = 1000;

/** All rows of `config.table`, paginated, using exactly `config.select`. */
async function fetchAllSourceRows(config: EntityConfig): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from(config.table)
      .select(config.select)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${config.table}: ${error.message}`);
    // `config.select` is a runtime string, not a literal, so supabase-js
    // can't infer a row type from it and falls back to `GenericStringError`
    // -- same situation as generate-quest.ts's `recentRows` cast, and the
    // same `unknown`-first escape hatch TS itself suggests for it.
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** All stored embedding metadata (hash + model, not the vector itself) for
 * `config.sideTable`, keyed by main-table id. Paginated for the same reason
 * as `fetchAllSourceRows`. */
async function fetchAllStoredMeta(config: EntityConfig): Promise<Map<string, StoredEmbeddingRow>> {
  const map = new Map<string, StoredEmbeddingRow>();
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from(config.sideTable)
      .select(`${config.idColumn}, source_hash, embedding_model`)
      .order(config.idColumn)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${config.sideTable}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    for (const row of page) {
      map.set(row[config.idColumn] as string, {
        source_hash: row.source_hash as string,
        embedding_model: row.embedding_model as string,
      });
    }
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return map;
}

interface Candidate {
  id: string;
  text: string;
  hash: string;
}

/** Scans the whole entity table and returns rows needing a fresh embedding
 * (missing, changed text, or a different embedding_model than `provider`'s —
 * see isEmbeddingStale), alongside the total row count scanned. */
async function findStaleCandidates(
  kind: EntityKind,
  provider: EmbeddingProvider,
): Promise<{ stale: Candidate[]; scanned: number }> {
  const config = ENTITIES[kind];
  const [rows, storedById] = await Promise.all([fetchAllSourceRows(config), fetchAllStoredMeta(config)]);

  const stale: Candidate[] = [];
  for (const row of rows) {
    const text = config.build(row);
    const hash = await entityEmbedHash(text);
    const id = row.id as string;
    const stored = storedById.get(id) ?? null;
    if (isEmbeddingStale(stored, { sourceHash: hash, model: provider.model })) {
      stale.push({ id, text, hash });
    }
  }
  return { stale, scanned: rows.length };
}

/** Resolves the platform embedding provider, mapping a misconfiguration
 * (no provider enabled, more than one enabled, missing platform key, ...)
 * to a 503 rather than a 500 -- this is an ops/config problem, not a bug. */
async function resolvePlatformProvider(): Promise<EmbeddingProvider | Response> {
  const platformKeys = await fetchPlatformKeys(admin, ["openai", "gemini"]);
  try {
    return await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
  } catch (e) {
    if (e instanceof EmbeddingProviderConfigError) {
      return json({ error: "embedding_provider_unavailable", detail: e.message }, 503);
    }
    throw e;
  }
}

// ── Batch mode ────────────────────────────────────────────────────────────

async function handleBatch(body: { entity?: unknown; limit?: unknown }, adminUserId: string): Promise<Response> {
  const entity = body.entity;
  if (!isEntityKind(entity)) {
    return json({ error: "Invalid entity -- must be 'npc', 'faction', 'location', or 'note'" }, 400);
  }
  const limit = clampBatchLimit(body.limit);

  const provider = await resolvePlatformProvider();
  if (provider instanceof Response) return provider;

  let stale: Candidate[], scanned: number;
  try {
    ({ stale, scanned } = await findStaleCandidates(entity, provider));
  } catch (e) {
    console.error("embed-content batch scan failed:", e);
    return json({ error: e instanceof Error ? e.message : "Failed to scan for stale embeddings" }, 500);
  }

  const candidates = stale.slice(0, limit);
  const skipped = scanned - stale.length;
  const remaining = stale.length - candidates.length;

  if (candidates.length === 0) {
    return json({ processed: 0, skipped, remaining });
  }

  let vectors: number[][];
  let usage: EmbeddingUsage;
  try {
    ({ vectors, usage } = await provider.embed(candidates.map((c) => c.text)));
  } catch (e) {
    console.error("embed-content batch embed failed:", e);
    return json({ error: e instanceof Error ? e.message : "Embedding failed" }, 502);
  }

  // Real provider spend was just incurred, regardless of whether the DB
  // write below succeeds -- record it now. ONE row for the whole batch
  // (summed input tokens), not one per row -- see the module doc.
  await recordFreeGeneration(admin, adminUserId, "entity_embedding", {
    model: provider.model,
    provider: usage.provider,
    input_tokens: usage.input_tokens,
  });

  const config = ENTITIES[entity];
  const upsertRows = candidates.map((c, i) => ({
    [config.idColumn]: c.id,
    embedding: toVectorLiteral(vectors[i]),
    embedding_model: provider.model,
    source_hash: c.hash,
  }));

  const { error: upsertError } = await admin.from(config.sideTable).upsert(upsertRows, { onConflict: config.idColumn });
  if (upsertError) {
    console.error(`embed-content batch upsert failed (${config.sideTable}):`, upsertError.message);
    return json({ error: "Failed to store embeddings" }, 500);
  }

  return json({ processed: candidates.length, skipped, remaining });
}

// ── Single mode ───────────────────────────────────────────────────────────

async function handleSingle(req: Request, body: { entity?: unknown; id?: unknown }): Promise<Response> {
  const entity = body.entity;
  if (!isEntityKind(entity)) {
    return json({ error: "Invalid entity -- must be 'npc', 'faction', 'location', or 'note'" }, 400);
  }
  const id = body.id;
  if (typeof id !== "string" || !id) return json({ error: "Missing id" }, 400);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  const config = ENTITIES[entity];
  const { data: rowData, error: rowError } = await admin
    .from(config.table)
    .select(config.select)
    .eq("id", id)
    .maybeSingle();
  if (rowError) {
    console.error(`embed-content single lookup failed (${config.table}):`, rowError.message);
    return json({ error: `Failed to load ${entity}` }, 500);
  }
  const row = rowData as Record<string, unknown> | null;
  if (!row) return json({ error: `${entity} not found` }, 404);

  // The whole authorization story for this mode: a DM may only trigger
  // embedding for their own npc/faction/location, never someone else's, even
  // though the service-role client above bypasses RLS. Never trust a
  // caller-supplied user id -- identity comes only from the verified bearer
  // token.
  if ((row.user_id as string) !== user.id) return json({ error: "Forbidden" }, 403);

  // Campaign notes feed the Chronicle's server-side retrieval corpus. Row
  // ownership alone is insufficient here: the legacy notes policy allowed a
  // player to attach their own row to any known campaign id. Require DM access
  // before allowing that row into the campaign's embedding corpus. Global
  // notes remain private to their owner and need no campaign-role check.
  if (entity === "note" && typeof row.campaign_id === "string") {
    const campaignId = row.campaign_id;
    const [{ data: ownedCampaign }, { data: dmMembership }] = await Promise.all([
      admin.from("campaigns").select("id").eq("id", campaignId).eq("user_id", user.id).maybeSingle(),
      admin.from("campaign_members").select("id").eq("campaign_id", campaignId).eq("user_id", user.id).eq("role", "dm").maybeSingle(),
    ]);
    if (!ownedCampaign && !dmMembership) return json({ error: "Forbidden" }, 403);
  }

  const provider = await resolvePlatformProvider();
  if (provider instanceof Response) return provider;

  const text = config.build(row);
  const hash = await entityEmbedHash(text);

  const { data: existingData, error: existingError } = await admin
    .from(config.sideTable)
    .select("source_hash, embedding_model")
    .eq(config.idColumn, id)
    .maybeSingle();
  if (existingError) {
    console.error(`embed-content single stored-meta lookup failed (${config.sideTable}):`, existingError.message);
    return json({ error: "Failed to load existing embedding" }, 500);
  }
  const stored = existingData as StoredEmbeddingRow | null;

  // Short-circuit: no API call, no write, when nothing has actually changed.
  if (!isEmbeddingStale(stored, { sourceHash: hash, model: provider.model })) {
    return json({ embedded: false, entity, id, source_hash: hash, reason: "unchanged" });
  }

  let vectors: number[][];
  let usage: EmbeddingUsage;
  try {
    ({ vectors, usage } = await provider.embed([text]));
  } catch (e) {
    console.error("embed-content single embed failed:", e);
    return json({ error: e instanceof Error ? e.message : "Embedding failed" }, 502);
  }

  // One row per actual embed -- the short-circuit above already returned
  // before this point when there was nothing to log. Platform-paid, charged
  // to nobody -- see recordFreeGeneration's note on why is_byok must be false.
  await recordFreeGeneration(admin, user.id, "entity_embedding", {
    model: provider.model,
    provider: usage.provider,
    input_tokens: usage.input_tokens,
  });

  const { error: upsertError } = await admin.from(config.sideTable).upsert({
    [config.idColumn]: id,
    embedding: toVectorLiteral(vectors[0]),
    embedding_model: provider.model,
    source_hash: hash,
  }, { onConflict: config.idColumn });
  if (upsertError) {
    console.error(`embed-content single upsert failed (${config.sideTable}):`, upsertError.message);
    return json({ error: "Failed to store embedding" }, 500);
  }

  return json({ embedded: true, entity, id, source_hash: hash });
}

// ── Handler ───────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  let body: { mode?: unknown; entity?: unknown; id?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.mode === "batch") {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
    if (await isAccountSuspended(admin, gate.id)) return suspendedResponse();
    return handleBatch(body, gate.id);
  }

  if (body.mode === "single") {
    return handleSingle(req, body);
  }

  return json({ error: "Invalid mode -- must be 'batch' or 'single'" }, 400);
}));
