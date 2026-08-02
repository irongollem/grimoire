import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { buildMonsterEmbedText, monsterEmbedHash, type EmbeddableMonster } from "../_shared/monsterEmbedText.ts";
import {
  EmbeddingProviderConfigError,
  isEmbeddingStale,
  resolveEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
  type EmbeddingUsage,
} from "../_shared/embeddings.ts";

/**
 * Embedding endpoint for #595 (retrieval-backed monster selection). Two
 * modes sharing one entry point because both ultimately do the same three
 * things — build text, embed it, upsert the vector — against the two
 * monster-embedding side tables (library_monster_embeddings /
 * monster_embeddings; see
 * supabase/migrations/20260803000001_rag_monster_embeddings.sql):
 *
 *   mode: "batch"  — admin-gated backfill/repair, driven by repeated calls
 *                    (see `remaining` in the response).
 *   mode: "single" — embed-on-write for one of the caller's own custom
 *                    monsters, called fire-and-forget after create/save.
 *
 * NOT CHARGED, BUT RECORDED: embedding is infrastructure that makes the
 * Encounter Suggester's retrieval possible, not a user-facing generation in
 * its own right, so #595 specifies no credit deduction for it — the
 * encounter generation it serves is already charged. But every provider
 * call still goes through `recordFreeGeneration()` with a delta of 0 and the
 * real model/provider/input_tokens, generation type "monster_embedding"
 * (seeded at 0 credits in `ai_generation_credit_costs` by the migration).
 * Note that is NOT the BYOK path: is_byok stays false because the platform
 * key paid for this call, and platform-cost reporting filters BYOK rows out.
 * A call that wrote no ledger row would be invisible spend: the owner prices features from
 * measured provider cost, not usage estimates, and `ai_model_pricing` has
 * rows for the embedding models specifically so this cost is measurable.
 * Batch mode writes ONE row per invocation (summed tokens across the whole
 * batch), not one per monster — ~37 rows for a full 3,639-row backfill, not
 * 3,639. Single mode writes one row per actual embed, and none at all when
 * the unchanged-hash/model short-circuit fires, since no provider call was
 * made and there is nothing to log.
 *
 * NO checkRateLimit: the shared `ai_generation` bucket exists to throttle
 * expensive, user-visible generations (see generate-encounter/index.ts).
 * Spending it here would let ordinary monster editing — mode: "single"
 * fires on every save — exhaust a DM's generation budget for something they
 * didn't ask for and never see. The guards that DO apply instead: auth +
 * ownership (mode: "single" verifies monsters.user_id === auth.uid()), the
 * unchanged-hash/model short-circuit below (most saves make no provider
 * call at all — only a changed monster or a provider swap does), and the
 * per-entity quota that already caps how many monsters a user can create.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ── Batch mode: target table config ──────────────────────────────────────

type BatchTarget = "library" | "custom";

interface TargetConfig {
  mainTable: "library_monsters" | "monsters";
  sideTable: "library_monster_embeddings" | "monster_embeddings";
  /** FK column on the side table pointing back at the main table's id. */
  idColumn: "library_monster_id" | "monster_id";
}

const TARGET_CONFIG: Record<BatchTarget, TargetConfig> = {
  library: { mainTable: "library_monsters", sideTable: "library_monster_embeddings", idColumn: "library_monster_id" },
  custom: { mainTable: "monsters", sideTable: "monster_embeddings", idColumn: "monster_id" },
};

const DEFAULT_BATCH_LIMIT = 100;
const MAX_BATCH_LIMIT = 500;

function clampBatchLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_LIMIT;
  return Math.min(Math.floor(raw), MAX_BATCH_LIMIT);
}

// library_monsters has no `description` column (see src/types/monster.types.ts
// — Monster.description is optional for exactly this reason: it only ever
// comes back populated for rows that actually have one).
const LIBRARY_SELECT = "id, name, monster_type, size, habitat, tags, stat_block";
const CUSTOM_SELECT = "id, name, monster_type, size, habitat, tags, description, stat_block";

interface MonsterSourceRow {
  id: string;
  name: string;
  monster_type: string | null;
  size: string | null;
  habitat: string | null;
  tags: string[] | null;
  description: string | null;
  stat_block: { challenge_rating?: string | null } | null;
}

function toMonsterSourceRow(row: Record<string, unknown>, includeDescription: boolean): MonsterSourceRow {
  return {
    id: row.id as string,
    name: row.name as string,
    monster_type: (row.monster_type as string | null) ?? null,
    size: (row.size as string | null) ?? null,
    habitat: (row.habitat as string | null) ?? null,
    tags: (row.tags as string[] | null) ?? null,
    description: includeDescription ? (row.description as string | null) ?? null : null,
    stat_block: (row.stat_block as MonsterSourceRow["stat_block"]) ?? null,
  };
}

interface StoredEmbeddingRow {
  source_hash: string;
  embedding_model: string;
}

// A plain .select() can be silently capped by the project's configured
// PostgREST max-rows setting -- for library_monsters (~3,541 rows) that
// would make a "remaining" count that's supposed to cover the whole table
// quietly wrong. Explicit range-paginated reads are the only way to
// guarantee every row is seen regardless of that setting.
const PAGE_SIZE = 1000;

/** All rows of the target's main table, paginated. Custom target excludes
 * Open5e-imported rows: match_custom_monsters already filters
 * coalesce(open5e_import, false) = false at query time, so a legacy
 * imported row's embedding is never read -- embedding it anyway would just
 * spend platform API budget on a vector nothing ever queries. */
async function fetchAllSourceRows(target: BatchTarget): Promise<MonsterSourceRow[]> {
  const config = TARGET_CONFIG[target];
  const rows: MonsterSourceRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = target === "library"
      ? await admin.from(config.mainTable).select(LIBRARY_SELECT).order("id").range(offset, offset + PAGE_SIZE - 1)
      : await admin.from(config.mainTable).select(CUSTOM_SELECT).eq("open5e_import", false).order("id")
        .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${config.mainTable}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    for (const row of page) rows.push(toMonsterSourceRow(row, target === "custom"));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** All stored embedding metadata (hash + model, not the vector itself) for the
 * target's side table, keyed by main-table id. Paginated for the same reason
 * as `fetchAllSourceRows`. */
async function fetchAllStoredMeta(target: BatchTarget): Promise<Map<string, StoredEmbeddingRow>> {
  const config = TARGET_CONFIG[target];
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

/** Scans the whole target table and returns rows needing a fresh embedding
 * (missing, changed text, or a different embedding_model than `provider`'s —
 * see isEmbeddingStale), alongside the total row count scanned. */
async function findStaleCandidates(
  target: BatchTarget,
  provider: EmbeddingProvider,
): Promise<{ stale: Candidate[]; scanned: number }> {
  const [rows, storedById] = await Promise.all([fetchAllSourceRows(target), fetchAllStoredMeta(target)]);

  const stale: Candidate[] = [];
  for (const row of rows) {
    const embeddable: EmbeddableMonster = {
      name: row.name,
      monster_type: row.monster_type,
      size: row.size,
      habitat: row.habitat,
      tags: row.tags,
      description: row.description,
      stat_block: row.stat_block,
    };
    const text = buildMonsterEmbedText(embeddable);
    const hash = await monsterEmbedHash(text);
    const stored = storedById.get(row.id) ?? null;
    if (isEmbeddingStale(stored, { sourceHash: hash, model: provider.model })) {
      stale.push({ id: row.id, text, hash });
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

async function handleBatch(body: { target?: unknown; limit?: unknown }, adminUserId: string): Promise<Response> {
  const target = body.target;
  if (target !== "library" && target !== "custom") {
    return json({ error: "Invalid target -- must be 'library' or 'custom'" }, 400);
  }
  const limit = clampBatchLimit(body.limit);

  const provider = await resolvePlatformProvider();
  if (provider instanceof Response) return provider;

  let stale: Candidate[], scanned: number;
  try {
    ({ stale, scanned } = await findStaleCandidates(target, provider));
  } catch (e) {
    console.error("embed-monsters batch scan failed:", e);
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
    console.error("embed-monsters batch embed failed:", e);
    return json({ error: e instanceof Error ? e.message : "Embedding failed" }, 502);
  }

  // Real provider spend was just incurred, regardless of whether the DB
  // write below succeeds -- record it now. ONE row for the whole batch
  // (summed input tokens), not one per monster -- see the module doc.
  // recordFreeGeneration, NOT recordGeneration(isByok=true): this is spend WE
  // incurred on the platform key, so is_byok must stay false or platform-cost
  // reporting filters the row out and the spend goes invisible.
  await recordFreeGeneration(admin, adminUserId, "monster_embedding", {
    model: provider.model,
    provider: usage.provider,
    input_tokens: usage.input_tokens,
  });

  const config = TARGET_CONFIG[target];
  const upsertRows = candidates.map((c, i) => ({
    [config.idColumn]: c.id,
    embedding: toVectorLiteral(vectors[i]),
    embedding_model: provider.model,
    source_hash: c.hash,
  }));

  const { error: upsertError } = await admin.from(config.sideTable).upsert(upsertRows, { onConflict: config.idColumn });
  if (upsertError) {
    console.error(`embed-monsters batch upsert failed (${config.sideTable}):`, upsertError.message);
    return json({ error: "Failed to store embeddings" }, 500);
  }

  return json({ processed: candidates.length, skipped, remaining });
}

// ── Single mode ───────────────────────────────────────────────────────────

interface FullMonsterRow extends MonsterSourceRow {
  user_id: string;
}

async function handleSingle(req: Request, body: { monster_id?: unknown }): Promise<Response> {
  const monsterId = body.monster_id;
  if (typeof monsterId !== "string" || !monsterId) return json({ error: "Missing monster_id" }, 400);

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

  const { data: monsterData, error: monsterError } = await admin
    .from("monsters")
    .select("id, user_id, name, monster_type, size, habitat, tags, description, stat_block")
    .eq("id", monsterId)
    .maybeSingle();
  if (monsterError) {
    console.error("embed-monsters single lookup failed:", monsterError.message);
    return json({ error: "Failed to load monster" }, 500);
  }
  const monster = monsterData as FullMonsterRow | null;
  if (!monster) return json({ error: "Monster not found" }, 404);

  // The whole authorization story for this mode: a DM may only trigger
  // embedding for their own monster, never someone else's, even though the
  // service-role client above bypasses RLS. Never trust a caller-supplied
  // user id -- identity comes only from the verified bearer token.
  if (monster.user_id !== user.id) return json({ error: "Forbidden" }, 403);

  const provider = await resolvePlatformProvider();
  if (provider instanceof Response) return provider;

  const embeddable: EmbeddableMonster = {
    name: monster.name,
    monster_type: monster.monster_type,
    size: monster.size,
    habitat: monster.habitat,
    tags: monster.tags,
    description: monster.description,
    stat_block: monster.stat_block,
  };
  const text = buildMonsterEmbedText(embeddable);
  const hash = await monsterEmbedHash(text);

  const { data: existingData, error: existingError } = await admin
    .from("monster_embeddings")
    .select("source_hash, embedding_model")
    .eq("monster_id", monsterId)
    .maybeSingle();
  if (existingError) {
    console.error("embed-monsters single stored-meta lookup failed:", existingError.message);
    return json({ error: "Failed to load existing embedding" }, 500);
  }
  const stored = existingData as StoredEmbeddingRow | null;

  // Short-circuit: no API call, no write, when nothing has actually changed.
  if (!isEmbeddingStale(stored, { sourceHash: hash, model: provider.model })) {
    return json({ embedded: false, monster_id: monsterId, source_hash: hash, reason: "unchanged" });
  }

  let vectors: number[][];
  let usage: EmbeddingUsage;
  try {
    ({ vectors, usage } = await provider.embed([text]));
  } catch (e) {
    console.error("embed-monsters single embed failed:", e);
    return json({ error: e instanceof Error ? e.message : "Embedding failed" }, 502);
  }

  // One row per actual embed -- the short-circuit above already returned
  // before this point when there was nothing to log. Platform-paid, charged to
  // nobody -- see recordFreeGeneration's note on why is_byok must be false.
  await recordFreeGeneration(admin, user.id, "monster_embedding", {
    model: provider.model,
    provider: usage.provider,
    input_tokens: usage.input_tokens,
  });

  const { error: upsertError } = await admin.from("monster_embeddings").upsert({
    monster_id: monsterId,
    embedding: toVectorLiteral(vectors[0]),
    embedding_model: provider.model,
    source_hash: hash,
  }, { onConflict: "monster_id" });
  if (upsertError) {
    console.error("embed-monsters single upsert failed:", upsertError.message);
    return json({ error: "Failed to store embedding" }, 500);
  }

  return json({ embedded: true, monster_id: monsterId, source_hash: hash });
}

// ── Handler ───────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  let body: { mode?: unknown; target?: unknown; limit?: unknown; monster_id?: unknown };
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
