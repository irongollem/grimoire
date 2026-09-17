import { serve } from "std/http/server.ts";
import { createClient, type User } from "@supabase/supabase-js";
import { createDraftManifest, createGenerationPlan, slotRelativePath, type GenerationAttempt, type GenerationJob, type GenerationPlan, type PackArtBible } from "../../../src/cartographer/authoringPlan.ts";
import { validatePack } from "../../../src/cartographer/validatePack.ts";
import type { TilePackManifest } from "../../../src/cartographer/packSchema.ts";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { generateImage } from "../_shared/imageGen.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import { buildTileProvenance } from "./tileProvenance.ts";
import { libraryPackTarget, mintLibraryPackId, packPrefix, userPackTarget } from "./packTarget.ts";
import { fetchCreditCost, recordFreeGeneration, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { tilePackSlug, webpDimensions } from "../_shared/tilePackGeneration.ts";
import { attemptCharge, attemptsRemaining, canAttempt } from "../../../src/cartographer/generationBudget.ts";
import { chunk, listAllFilePaths, type StorageEntry } from "../_shared/storage-purge.ts";

const MODEL = "gpt-image-2";
const QUALITY = "low";
const MAX_NORMALIZED_B64 = 512_000;
const PROOF_SLOTS = new Set(["floor:0", "wallSegmentH:0", "solidBlock:0"]);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function requireUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}

/** The same server-controlled claim `_shared/requireAdmin.ts` checks — checked
 *  inline here because every caller already has the `user` object in hand
 *  (from `requireUser` below), and `requireAdmin` would mean re-fetching it. */
function isAppAdmin(user: User): boolean {
  return user.app_metadata?.role === "admin";
}

/**
 * Loads a generation run and resolves which lane it targets, authorizing per
 * lane as it goes — the one loader both lanes share, so a caller can never
 * reach a run's target without also passing that lane's gate:
 *
 *  - user lane (`tile_pack_id` set): unchanged from before this story — the
 *    run's own `user_id` must equal the caller's. A DM's private pack stays
 *    theirs alone.
 *  - library lane (`library_tile_pack_id` set): the caller must be an app
 *    admin — ANY admin, not only the one who started the run, matching the
 *    `tile_pack_generation_runs_select` RLS policy shipped in 20260917225430.
 *    A half-finished library pack must not be stranded because the admin who
 *    started it is on holiday.
 */
async function requireGenerationRun(runId: string, user: User) {
  const { data } = await admin.from("tile_pack_generation_runs")
    .select("*, user_tile_packs(*), library_tile_packs(*)")
    .eq("id", runId).maybeSingle();
  const row = data as null | {
    id: string;
    user_id: string;
    campaign_id: string | null;
    tile_pack_id: string | null;
    library_tile_pack_id: string | null;
    status: string;
    cancel_requested: boolean;
    plan: GenerationPlan;
    charged_credits: number;
    user_tile_packs: { id: string; user_id: string; pack_id: string; pack_version: number; manifest: TilePackManifest } | null;
    library_tile_packs: { id: string; pack_id: string; pack_version: number; manifest: TilePackManifest } | null;
  };
  if (!row) return null;
  if (row.tile_pack_id) {
    if (row.user_id !== user.id || !row.user_tile_packs) return null;
    return { ...row, lane: "user" as const, target: userPackTarget(row.user_tile_packs) };
  }
  if (!row.library_tile_pack_id || !row.library_tile_packs) return null;
  if (!isAppAdmin(user)) return null;
  return { ...row, lane: "library" as const, target: libraryPackTarget(row.library_tile_packs) };
}

async function campaignForGeneration(campaignId: string, userId: string) {
  const { data: campaign } = await admin.from("campaigns")
    .select("id, user_id, ai_enabled, openai_api_key")
    .eq("id", campaignId).maybeSingle();
  if (!campaign || campaign.ai_enabled !== true) return null;
  if (campaign.user_id === userId) return campaign;
  const { data: member } = await admin.from("campaign_members").select("role")
    .eq("campaign_id", campaignId).eq("user_id", userId).eq("role", "dm").maybeSingle();
  return member ? campaign : null;
}

function artBible(name: string, description: string): PackArtBible {
  return {
    visual_medium: "polished painterly fantasy game asset",
    rendering_conventions: [
      "exact orthographic top-down view",
      "clean readable shapes at 128×128",
      "even lighting without directional cast shadows",
    ],
    world_motifs: [],
    tone_palette: [],
    environment_defaults: [],
    hard_canon: [],
    exclusions: ["text", "characters", "watermarks", "isometric perspective"],
    pack_local_theme: `${name}. ${description}`.trim(),
    campaign_consistency: "independent",
  };
}

async function createRun(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isUserPro(admin, userId))) return json({ error: "pro_required" }, 403);
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!campaignId || !name || name.length > 100 || description.length > 1000) {
    return json({ error: "invalid_pack_concept" }, 400);
  }
  if (!(await campaignForGeneration(campaignId, userId))) return json({ error: "campaign_forbidden" }, 403);
  const basePackId = tilePackSlug(typeof body.pack_id === "string" ? body.pack_id : name);
  const packId = `custom-${basePackId.replace(/^custom-/, "")}-${userId.slice(0, 8)}`;
  if (!basePackId) return json({ error: "invalid_pack_id" }, 400);

  const { data: versions } = await admin.from("user_tile_packs").select("pack_version")
    .eq("user_id", userId).eq("pack_id", packId).order("pack_version", { ascending: false }).limit(1);
  const version = ((versions?.[0]?.pack_version as number | undefined) ?? 0) + 1;
  const manifest = createDraftManifest({ packId, name, description, packVersion: version });
  const plan = createGenerationPlan({ manifest, artBible: artBible(name, description) });

  const { data: pack, error: packError } = await admin.from("user_tile_packs").insert({
    user_id: userId,
    pack_id: packId,
    pack_version: version,
    name,
    description,
    schema_version: manifest.schema_version,
    manifest,
    source: "generated",
    status: "draft",
  }).select().single();
  if (packError || !pack) return json({ error: packError?.message ?? "pack_create_failed" }, 500);

  const { data: run, error: runError } = await admin.from("tile_pack_generation_runs").insert({
    user_id: userId,
    campaign_id: campaignId,
    tile_pack_id: pack.id,
    status: "proof_pending",
    plan,
    total_jobs: plan.jobs.length,
  }).select().single();
  if (runError || !run) {
    await admin.from("user_tile_packs").delete().eq("id", pack.id);
    return json({ error: runError?.message ?? "run_create_failed" }, 500);
  }

  const { error: jobsError } = await admin.from("tile_pack_generation_jobs").insert(
    plan.jobs.map((job, ordinal) => ({
      run_id: run.id,
      ordinal,
      slot_id: job.id,
      phase: PROOF_SLOTS.has(job.id) ? "proof" : "pack",
      job,
    })),
  );
  if (jobsError) {
    await admin.from("tile_pack_generation_runs").delete().eq("id", run.id);
    await admin.from("user_tile_packs").delete().eq("id", pack.id);
    return json({ error: jobsError.message }, 500);
  }
  return json({ run_id: run.id, pack_id: pack.id, total_jobs: plan.jobs.length }, 201);
}

/**
 * Mirrors `createRun` above for the library lane: no `isUserPro` check (there
 * is no subscription to gate — the caller must simply be an admin), no
 * campaign of any kind, and the new pack row lands in `library_tile_packs`
 * rather than `user_tile_packs`. Same rollback-on-failure sequence.
 */
async function createLibraryRun(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 100 || description.length > 1000) {
    return json({ error: "invalid_pack_concept" }, 400);
  }
  const packId = mintLibraryPackId(typeof body.pack_id === "string" ? body.pack_id : name);
  if (!packId) return json({ error: "invalid_pack_id" }, 400);

  const { data: versions } = await admin.from("library_tile_packs").select("pack_version")
    .eq("pack_id", packId).order("pack_version", { ascending: false }).limit(1);
  const version = ((versions?.[0]?.pack_version as number | undefined) ?? 0) + 1;
  const manifest = createDraftManifest({ packId, name, description, packVersion: version });
  const plan = createGenerationPlan({ manifest, artBible: artBible(name, description) });

  const { data: pack, error: packError } = await admin.from("library_tile_packs").insert({
    pack_id: packId,
    pack_version: version,
    name,
    description,
    schema_version: manifest.schema_version,
    manifest,
    status: "draft",
    // Every pack born through THIS action is model output, so it takes the
    // default the epic settled on (17 Sep 2026): CC0, published by us.
    //
    // The reasoning is worth keeping next to the line that applies it — the
    // question is not which licence we must grant but whether we hold a
    // copyright to grant at all. Output without sufficient human authorship is
    // held uncopyrightable by the US Copyright Office, and the EU's "own
    // intellectual creation" standard points the same way; CC-BY would assert a
    // right we may not hold and impose an attribution condition on work that is
    // probably already free.
    //
    // Set here rather than as a column default because it is a fact about how
    // this pack was made, not about the table: an uploaded or CLI-authored pack
    // arriving by another route may legitimately carry different terms, and
    // `license_keys` stays editable per pack for exactly that.
    content_source_key: "grimoire-art",
    license_keys: ["cc0"],
  }).select().single();
  if (packError || !pack) return json({ error: packError?.message ?? "pack_create_failed" }, 500);

  const { data: run, error: runError } = await admin.from("tile_pack_generation_runs").insert({
    user_id: user.id,
    library_tile_pack_id: pack.id,
    status: "proof_pending",
    plan,
    total_jobs: plan.jobs.length,
  }).select().single();
  if (runError || !run) {
    await admin.from("library_tile_packs").delete().eq("id", pack.id);
    return json({ error: runError?.message ?? "run_create_failed" }, 500);
  }

  const { error: jobsError } = await admin.from("tile_pack_generation_jobs").insert(
    plan.jobs.map((job, ordinal) => ({
      run_id: run.id,
      ordinal,
      slot_id: job.id,
      phase: PROOF_SLOTS.has(job.id) ? "proof" : "pack",
      job,
    })),
  );
  if (jobsError) {
    await admin.from("tile_pack_generation_runs").delete().eq("id", run.id);
    await admin.from("library_tile_packs").delete().eq("id", pack.id);
    return json({ error: jobsError.message }, 500);
  }
  return json({ run_id: run.id, pack_id: pack.id, total_jobs: plan.jobs.length }, 201);
}

/**
 * Publish or retire a library pack. `status` on `library_tile_packs` is a
 * publication gate, not a progress flag (see the note in `completeSlot`
 * below), so flipping it to `published` is always an explicit admin act
 * rather than something the generation run reaches on its own.
 *
 * Publishing re-validates the manifest first: RLS cannot call `validatePack`,
 * and publishing a pack with missing slots breaks the Cartographer for every
 * DM who picks it. Un-publishing (`archived`) needs no validation — retiring
 * a pack is always safe, and must stay possible even for a pack that never
 * finished.
 */
async function setLibraryPackStatus(user: User, body: Record<string, unknown>, publish: boolean): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("id, manifest").eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);
  if (publish) {
    const validation = validatePack(pack.manifest as TilePackManifest);
    if (!validation.valid) return json({ error: "pack_incomplete", validation }, 409);
    const { error } = await admin.from("library_tile_packs").update({ status: "published" }).eq("id", pack.id);
    if (error) return json({ error: error.message }, 500);
    return json({ status: "published" });
  }
  const { error } = await admin.from("library_tile_packs").update({ status: "archived" }).eq("id", pack.id);
  if (error) return json({ error: error.message }, 500);
  return json({ status: "archived" });
}

async function registerUpload(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isUserPro(admin, userId))) return json({ error: "pro_required" }, 403);
  const manifest = body.manifest as TilePackManifest | undefined;
  if (!manifest || manifest.schema_version !== 2 || manifest.base_tile_size !== 128 || !manifest.pack_id.startsWith("custom-")) {
    return json({ error: "invalid_manifest" }, 400);
  }
  const validation = validatePack(manifest);
  const canonicalPaths = Object.entries(manifest.assets).every(([category, slots]) => (slots ?? []).every((slot) =>
    slot.url === slotRelativePath({
      category: category as GenerationJob["slot"]["category"],
      ...(slot.side ? { side: slot.side } : {}),
      variant: slot.variant,
    })
  ));
  if (!validation.valid || validation.extras.length || !canonicalPaths || validation.warnings.some((warning) => warning.includes("non-WebP"))) {
    return json({ error: "invalid_manifest", validation }, 400);
  }
  const { data, error } = await admin.from("user_tile_packs").insert({
    user_id: userId,
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    name: manifest.name,
    description: manifest.description,
    schema_version: manifest.schema_version,
    manifest,
    source: "upload",
    status: "draft",
  }).select().single();
  if (error) return json({ error: error.code === "23505" ? "pack_version_exists" : error.message }, error.code === "23505" ? 409 : 500);
  return json({ pack: data }, 201);
}

async function finalizeUpload(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isUserPro(admin, userId))) return json({ error: "pro_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("user_tile_packs").select("*")
    .eq("id", packId).eq("user_id", userId).eq("source", "upload").eq("status", "draft").maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);
  const manifest = pack.manifest as TilePackManifest;
  const prefix = `${userId}/${pack.pack_id}/v${pack.pack_version}`;
  const checks = Object.values(manifest.assets).flatMap((slots) => slots ?? []).map(async (slot) => {
    const { data, error } = await admin.storage.from("tile-packs").download(`${prefix}/${slot.url}`);
    if (error || !data) return false;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const dimensions = webpDimensions(bytes);
    return dimensions?.width === 128 && dimensions.height === 128;
  });
  if (!(await Promise.all(checks)).every(Boolean)) return json({ error: "asset_verification_failed" }, 400);
  const { data: ready, error } = await admin.from("user_tile_packs").update({ status: "ready" }).eq("id", pack.id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ pack: ready });
}

async function deletePack(userId: string, body: Record<string, unknown>): Promise<Response> {
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("user_tile_packs").select("id, user_id, pack_id, pack_version")
    .eq("id", packId).eq("user_id", userId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);
  const { count: activeRuns } = await admin.from("tile_pack_generation_runs")
    .select("id", { count: "exact", head: true }).eq("tile_pack_id", pack.id)
    .in("status", ["proof_pending", "awaiting_approval", "generating", "cancelling"]);
  if ((activeRuns ?? 0) > 0) return json({ error: "cancel_generation_before_deleting" }, 409);

  const prefix = `${pack.user_id}/${pack.pack_id}/v${pack.pack_version}`;
  const paths = await listAllFilePaths(async (folder) => {
    const entries: StorageEntry[] = [];
    for (let offset = 0; ; offset += 1_000) {
      const { data, error } = await admin.storage.from("tile-packs").list(folder, { limit: 1_000, offset });
      if (error) throw error;
      entries.push(...(data as StorageEntry[]));
      if ((data?.length ?? 0) < 1_000) break;
    }
    return entries;
  }, prefix);
  for (const batch of chunk(paths, 100)) {
    const { error } = await admin.storage.from("tile-packs").remove(batch);
    if (error) return json({ error: error.message }, 500);
  }
  const { error } = await admin.from("user_tile_packs").delete().eq("id", pack.id).eq("user_id", userId);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
}

/** Mirrors `deletePack` above for the library lane: same active-run guard,
 *  same bucket-sweep-then-delete-row sequence, using the library target's
 *  own bucket and prefix (no user id segment — see `packTarget.ts`). */
async function deleteLibraryPack(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("id, pack_id, pack_version, status")
    .eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);
  // A published pack is referenced by PackRef from every map that used it, in
  // every DM's campaign — deleting one is not the admin's own data going away.
  // `unpublish_library_pack` is the retirement path: it stops the pack being
  // offered without pulling the tiles out from under maps already drawn with
  // it. This is the same shape as the active-run guard below: refuse, and name
  // the step that makes the delete safe.
  if (pack.status === "published") return json({ error: "unpublish_before_deleting" }, 409);
  const { count: activeRuns } = await admin.from("tile_pack_generation_runs")
    .select("id", { count: "exact", head: true }).eq("library_tile_pack_id", pack.id)
    .in("status", ["proof_pending", "awaiting_approval", "generating", "cancelling"]);
  if ((activeRuns ?? 0) > 0) return json({ error: "cancel_generation_before_deleting" }, 409);

  const prefix = packPrefix({ lane: "library", rowId: pack.id, packVersion: pack.pack_version });
  const paths = await listAllFilePaths(async (folder) => {
    const entries: StorageEntry[] = [];
    for (let offset = 0; ; offset += 1_000) {
      const { data, error } = await admin.storage.from("library-tile-packs").list(folder, { limit: 1_000, offset });
      if (error) throw error;
      entries.push(...(data as StorageEntry[]));
      if ((data?.length ?? 0) < 1_000) break;
    }
    return entries;
  }, prefix);
  for (const batch of chunk(paths, 100)) {
    const { error } = await admin.storage.from("library-tile-packs").remove(batch);
    if (error) return json({ error: error.message }, 500);
  }
  const { error } = await admin.from("library_tile_packs").delete().eq("id", pack.id);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
}

/**
 * The approved proof tiles, as image-input style references.
 *
 * `style_ref_path` is a 256x256 reduction and is what should be sent: measured
 * at ~1500 input tokens per 1024x1024 reference, three full-resolution raws cost
 * about five times the tile they help produce, on every call and every retry.
 * `raw_path` remains the fallback so a run started before 20260826215832 still
 * completes — correctly, just expensively.
 */
async function styleReferences(runId: string, bucket: "tile-packs" | "library-tile-packs"): Promise<Blob[]> {
  const { data } = await admin.from("tile_pack_generation_jobs").select("style_ref_path, raw_path")
    .eq("run_id", runId).eq("phase", "proof").eq("status", "normalized")
    .not("raw_path", "is", null).order("ordinal").limit(3);
  const blobs: Blob[] = [];
  for (const row of data ?? []) {
    const path = (row.style_ref_path as string | null) ?? (row.raw_path as string);
    const { data: file } = await admin.storage.from(bucket).download(path);
    if (file) blobs.push(file);
  }
  return blobs;
}

async function appendPlanAttempt(
  runId: string,
  plan: GenerationPlan,
  slotId: string,
  status: GenerationJob["status"],
  attempt: GenerationAttempt,
  path?: { raw?: string; normalized?: string },
): Promise<void> {
  const job = plan.jobs.find((candidate) => candidate.id === slotId);
  if (!job) return;
  job.status = status;
  job.attempts.push(attempt);
  if (path?.raw) job.paths.raw = path.raw;
  if (path?.normalized) job.paths.normalized = path.normalized;
  plan.updated_at = new Date().toISOString();
  await admin.from("tile_pack_generation_runs").update({ plan }).eq("id", runId);
}

async function generateSlot(user: User, body: Record<string, unknown>): Promise<Response> {
  const userId = user.id;
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const run = await requireGenerationRun(runId, user);
  if (!run || !jobId) return json({ error: "run_not_found" }, 404);
  if (run.cancel_requested || ["cancelling", "cancelled", "completed"].includes(run.status)) {
    return json({ error: "run_not_active" }, 409);
  }

  // Which gate applies depends on the lane, and the lane is only known once
  // the run (and its target) is resolved above — so this replaces the single
  // up-front isUserPro()/campaign check the user lane used to open with.
  let campaign: Awaited<ReturnType<typeof campaignForGeneration>> = null;
  if (run.lane === "user") {
    if (!(await isUserPro(admin, userId))) return json({ error: "pro_required" }, 403);
    // tile_pack_generation_runs_campaign_matches_lane guarantees campaign_id
    // is set whenever tile_pack_id (user lane) is.
    campaign = await campaignForGeneration(run.campaign_id!, userId);
    if (!campaign) return json({ error: "campaign_forbidden" }, 403);
  }
  // Library lane: the admin claim was already verified inside
  // requireGenerationRun. There is no campaign and no Pro concept for
  // platform-authored content.
  if (!(await checkRateLimit(admin, userId, "ai_generation"))) return json({ error: "rate_limited" }, 429);

  const allowedPhase = run.status === "proof_pending" ? "proof" : run.status === "generating" ? "pack" : null;
  if (!allowedPhase) return json({ error: "run_not_ready", status: run.status }, 409);
  const { data: claimed } = await admin.from("tile_pack_generation_jobs")
    .update({ status: "generating", error: null })
    .eq("id", jobId).eq("run_id", runId).eq("phase", allowedPhase).eq("status", "pending")
    .select().maybeSingle();
  if (!claimed) return json({ error: "job_not_pending" }, 409);
  const job = claimed.job as GenerationJob;
  const attemptsSoFar = (claimed.generation_attempts as number | null) ?? 0;
  // The slot was paid for once; this is what that bought. Checked after the
  // claim so a capped slot cannot be raced back into `generating` and left there.
  if (!canAttempt(attemptsSoFar)) {
    await admin.from("tile_pack_generation_jobs")
      .update({ status: "failed", error: "No retries left for this tile — accept it, or start a new pack." })
      .eq("id", jobId);
    return json({ error: "attempt_limit_reached" }, 409);
  }

  const [platformKeys, baseCost] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchCreditCost(admin, "tile_pack_generation"),
  ]);
  let campaignKey: string | null = null;
  // Library lane: platform key only. There is no campaign, so there is no
  // BYOK — `campaign` stays null for this lane (set above) and this block
  // is skipped entirely.
  if (campaign?.openai_api_key && await isUserPro(admin, campaign.user_id)) {
    try { campaignKey = await decryptValue(campaign.openai_api_key); } catch { campaignKey = null; }
  }
  const apiKey = campaignKey ?? platformKeys.openai;
  if (!apiKey) {
    await admin.from("tile_pack_generation_jobs").update({ status: "failed", error: "No OpenAI API key configured" }).eq("id", jobId);
    return json({ error: "no_openai_key" }, 422);
  }
  const isByok = !!campaignKey;
  // Retries are inside the price: the first attempt on a slot is charged, the
  // three after it are not. A provider error never reaches the increment below,
  // so our own failures do not eat the budget the user paid for.
  //
  // Library lane charges nothing at all — it is platform content, not billed
  // to any user — so it skips `reserveCredits` entirely rather than calling
  // it with cost 0 (which would no-op anyway, but the run has no credit
  // relationship to reserve against in the first place).
  const cost = run.lane === "library" ? 0 : isByok ? 0 : attemptCharge(baseCost, attemptsSoFar);
  const reservation = run.lane === "library"
    ? { ok: true as const, ids: [] as string[] }
    : await reserveCredits(admin, userId, cost, "tile_pack_generation");
  if (!reservation.ok) {
    await admin.from("tile_pack_generation_jobs").update({ status: "pending" }).eq("id", jobId);
    return reservationFailureResponse(reservation);
  }

  try {
    const references = allowedPhase === "pack" ? await styleReferences(runId, run.target.bucket) : [];
    const result = await generateImage({
      provider: "openai",
      model: MODEL,
      apiKey,
      // Same key: this path is openai-only, so the renderer's key screens too.
      screening: { apiKey, admin, userId, generationType: "tile_pack" },
      prompt: job.prompt.final_prompt,
      size: job.execution.requested_size,
      quality: QUALITY,
      sourceImages: references,
      background: job.mechanics.alpha === "transparent-outside-footprint" ? "transparent" : "opaque",
    });
    const attemptNumber = ((claimed.attempts as unknown[] | null)?.length ?? 0) + 1;
    const rawPath = `${run.target.prefix}/raw/${job.id.replaceAll(":", "-")}-${attemptNumber}.webp`;
    // Marked here, once, right where the bytes come back from the provider —
    // every downstream consumer (the raw upload below, and the b64 handed
    // back to the client for normalization) shares this one marked copy.
    // `result.contentType` is the provider-reported format, not an assumed
    // webp (imageGen.ts's ImageGenResult docstring) — required so the XMP
    // embedder picks the matching binary format rather than silently no-op'ing.
    const prov = buildTileProvenance(result.usage.provider, MODEL);
    const markedB64 = markGeneratedImageB64(result.b64, result.contentType, prov);
    const rawBytes = decodeBase64(markedB64);
    const { error: uploadError } = await admin.storage.from(run.target.bucket).upload(rawPath, rawBytes, {
      contentType: result.contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    await releaseCredits(admin, reservation.ids);
    const usage = {
      model: MODEL,
      quality: QUALITY,
      size: job.execution.requested_size,
      provider: result.usage.provider,
      image_count: 1,
      input_tokens: result.usage.input_tokens,
      input_image_tokens: result.usage.input_image_tokens,
      output_tokens: result.usage.output_tokens,
    };
    // A free retry is still provider spend, and `recordGeneration` writes
    // nothing at cost 0 — spendCredits short-circuits. Left that way, three of
    // every four calls would be invisible to cost reporting AND to
    // get_credit_calibration_hints, which averages what it can see and would
    // therefore recommend cutting a price it had only ever seen a quarter of.
    // recordFreeGeneration exists for exactly this: delta 0, is_byok false.
    //
    // The library lane always takes this branch: every tile is free to the
    // admin who requested it, but the real provider spend still has to stay
    // visible for the same reason a free retry does — otherwise cost
    // reporting and get_credit_calibration_hints would never see a single
    // library-pack tile's cost.
    if (run.lane === "library" || (!isByok && cost === 0)) {
      await recordFreeGeneration(admin, userId, "tile_pack_generation", usage);
    } else {
      await recordGeneration(admin, userId, "tile_pack_generation", isByok, cost, usage);
    }
    const attempt: GenerationAttempt = {
      at: new Date().toISOString(),
      action: "generated",
      source_path: rawPath,
      execution: {
        provider: result.usage.provider,
        model: MODEL,
        quality: QUALITY,
        input_text_tokens: result.usage.input_tokens,
        input_image_tokens: result.usage.input_image_tokens,
        output_image_tokens: result.usage.output_tokens,
      },
    };
    await admin.from("tile_pack_generation_jobs").update({
      generation_attempts: attemptsSoFar + 1,
      status: "generated",
      raw_path: rawPath,
      attempts: [...((claimed.attempts as unknown[] | null) ?? []), attempt],
    }).eq("id", jobId);
    await admin.from("tile_pack_generation_runs").update({ charged_credits: run.charged_credits + cost }).eq("id", runId);
    await appendPlanAttempt(runId, run.plan, job.id, "generated", attempt, { raw: rawPath });
    return json({ job_id: jobId, slot_id: job.id, image_b64: markedB64, content_type: result.contentType, mechanics: job.mechanics });
  } catch (error) {
    await releaseCredits(admin, reservation.ids);
    const message = error instanceof Error ? error.message : "Image generation failed";
    await admin.from("tile_pack_generation_jobs").update({ status: "failed", error: message }).eq("id", jobId);
    return json({ error: message }, 502);
  }
}

async function completeSlot(user: User, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const imageB64 = typeof body.image_b64 === "string" ? body.image_b64 : "";
  const styleRefB64 = typeof body.style_ref_b64 === "string" ? body.style_ref_b64 : "";
  const run = await requireGenerationRun(runId, user);
  if (!run || !jobId) return json({ error: "run_not_found" }, 404);
  if (!imageB64 || imageB64.length > MAX_NORMALIZED_B64) return json({ error: "invalid_normalized_image" }, 400);
  const bytes = decodeBase64(imageB64);
  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width !== 128 || dimensions.height !== 128) {
    return json({ error: "normalized_asset_must_be_128x128_webp" }, 400);
  }
  const { data: row } = await admin.from("tile_pack_generation_jobs").select("*")
    .eq("id", jobId).eq("run_id", runId).eq("status", "generated").maybeSingle();
  if (!row) return json({ error: "job_not_generated" }, 409);
  const job = row.job as GenerationJob;
  const relative = slotRelativePath(job.slot);
  const normalizedPath = `${run.target.prefix}/${relative}`;
  const { error: uploadError } = await admin.storage.from(run.target.bucket).upload(normalizedPath, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const manifest = structuredClone(run.target.manifest);
  const slots = [...(manifest.assets[job.slot.category] ?? [])].filter((slot) =>
    slot.variant !== job.slot.variant || slot.side !== job.slot.side
  );
  slots.push({
    ...(job.slot.side ? { side: job.slot.side } : {}),
    variant: job.slot.variant,
    url: relative,
    byteSize: bytes.byteLength,
  });
  manifest.assets[job.slot.category] = slots;
  // Proof slots only: these are the three that become style references.
  let styleRefPath: string | null = null;
  if (styleRefB64 && styleRefB64.length <= MAX_NORMALIZED_B64 * 4 && row.phase === "proof") {
    const candidate = `${run.target.prefix}/style-ref/${job.id.replaceAll(":", "-")}.webp`;
    const { error: refError } = await admin.storage.from(run.target.bucket)
      .upload(candidate, decodeBase64(styleRefB64), { contentType: "image/webp", upsert: true });
    // Non-fatal: styleReferences falls back to the raw, which costs more but
    // works. Losing the proof over a reference upload would be worse.
    if (!refError) styleRefPath = candidate;
  }

  const normalizedAttempt: GenerationAttempt = {
    at: new Date().toISOString(), action: "normalized", source_path: normalizedPath,
  };
  await admin.from("tile_pack_generation_jobs").update({
    status: "normalized",
    normalized_path: normalizedPath,
    ...(styleRefPath ? { style_ref_path: styleRefPath } : {}),
    attempts: [...((row.attempts as unknown[] | null) ?? []), normalizedAttempt],
  }).eq("id", jobId);
  // EU AI Act Art 50 (#889 S2). The per-tile XMP packet is the authoritative
  // mark; this is the queryable copy `AiGeneratedBadge` renders from, in the
  // same `ai_provenance jsonb` shape the other generator-fed tables carry
  // (20260917173931). Taken from this job's own "generated" attempt rather
  // than re-derived, so it records the provider and model that actually
  // produced the bytes — not whatever the constants happen to say today.
  //
  // Written on every normalized tile rather than once at completion: a run can
  // be cancelled or fail partway, and a pack holding generated art must say so
  // even when it never reached `completed`. The value is identical each time,
  // so the repeated write costs a column update and buys that guarantee.
  //
  // This write applies in both lanes — a library pack's provenance is exactly
  // as much a legal fact as a user pack's.
  const generated = (row.attempts as { action: string; execution?: { provider: string; model: string } }[] | null)
    ?.findLast((attempt) => attempt.action === "generated");
  const aiProvenance = generated?.execution
    ? buildTileProvenance(generated.execution.provider, generated.execution.model)
    : null;
  await admin.from(run.target.table)
    .update(aiProvenance ? { manifest, ai_provenance: aiProvenance } : { manifest })
    .eq("id", run.target.rowId);
  await appendPlanAttempt(runId, run.plan, job.id, "normalized", normalizedAttempt, { normalized: normalizedPath });

  const { count: completed } = await admin.from("tile_pack_generation_jobs")
    .select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "normalized");
  const { count: proofRemaining } = await admin.from("tile_pack_generation_jobs")
    .select("id", { count: "exact", head: true }).eq("run_id", runId).eq("phase", "proof").neq("status", "normalized");
  let status = run.status;
  if (run.cancel_requested) status = "cancelled";
  else if (proofRemaining === 0 && run.status === "proof_pending") status = "awaiting_approval";
  else if ((completed ?? 0) === run.plan.jobs.length) {
    const validation = validatePack(manifest);
    status = validation.valid ? "completed" : "failed";
    // library_tile_packs.status is `draft`/`published`/`archived` — a
    // publication gate, not a generation-progress flag, and it has no
    // `ready`/`failed` values at all. Writing either here for a library pack
    // would violate its status check constraint, potentially after up to 60
    // already-generated (and already-paid-for, in the platform's own spend)
    // tiles. The run's own `status` above already reports generation
    // progress; publication stays an explicit admin act via
    // `publish_library_pack`, which re-validates before flipping the switch.
    if (run.lane === "user") {
      await admin.from("user_tile_packs").update({ status: validation.valid ? "ready" : "failed" }).eq("id", run.target.rowId);
    }
  }
  await admin.from("tile_pack_generation_runs").update({
    completed_jobs: completed ?? 0,
    status,
    ...(status === "completed" || status === "cancelled" ? { completed_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
  return json({ status, completed_jobs: completed ?? 0, total_jobs: run.plan.jobs.length });
}

async function updateRun(user: User, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const action = typeof body.action === "string" ? body.action : "";
  const run = await requireGenerationRun(runId, user);
  if (!run) return json({ error: "run_not_found" }, 404);
  if (action === "approve_proof" && run.status === "awaiting_approval") {
    await admin.from("tile_pack_generation_runs").update({ status: "generating" }).eq("id", runId);
    return json({ status: "generating" });
  }
  if (action === "cancel" && !["completed", "cancelled"].includes(run.status)) {
    await admin.from("tile_pack_generation_runs").update({ status: "cancelling", cancel_requested: true }).eq("id", runId);
    await admin.from("tile_pack_generation_jobs").update({ status: "cancelled" })
      .eq("run_id", runId).eq("status", "pending");
    const { count } = await admin.from("tile_pack_generation_jobs").select("id", { count: "exact", head: true })
      .eq("run_id", runId).eq("status", "generating");
    if ((count ?? 0) === 0) {
      await admin.from("tile_pack_generation_runs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", runId);
    }
    return json({ status: (count ?? 0) === 0 ? "cancelled" : "cancelling" });
  }
  if (action === "retry_job") {
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    const { data: row } = await admin.from("tile_pack_generation_jobs")
      .select("generation_attempts").eq("id", jobId).eq("run_id", runId)
      .in("status", ["failed", "rejected"]).maybeSingle();
    if (!row) return json({ error: "job_not_retryable" }, 409);
    // Told here as well as in `generate`, so the button reports the budget
    // rather than queueing a call that will be refused a moment later.
    if (!canAttempt(row.generation_attempts as number)) {
      return json({ error: "attempt_limit_reached", attempts_remaining: 0 }, 409);
    }
    await admin.from("tile_pack_generation_jobs").update({ status: "pending", error: null })
      .eq("id", jobId).eq("run_id", runId).in("status", ["failed", "rejected"]);
    return json({ status: run.status, attempts_remaining: attemptsRemaining(row.generation_attempts as number) });
  }
  if (action === "regenerate_job" && run.status === "awaiting_approval") {
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    const { data: row } = await admin.from("tile_pack_generation_jobs").select("*")
      .eq("id", jobId).eq("run_id", runId).eq("phase", "proof").eq("status", "normalized").maybeSingle();
    if (!row) return json({ error: "proof_job_not_found" }, 404);
    if (!canAttempt(row.generation_attempts as number)) {
      return json({ error: "attempt_limit_reached", attempts_remaining: 0 }, 409);
    }
    const job = row.job as GenerationJob;
    if (row.normalized_path) await admin.storage.from(run.target.bucket).remove([row.normalized_path as string]);
    const manifest = structuredClone(run.target.manifest);
    manifest.assets[job.slot.category] = (manifest.assets[job.slot.category] ?? []).filter((slot) =>
      slot.variant !== job.slot.variant || slot.side !== job.slot.side
    );
    const attempt: GenerationAttempt = { at: new Date().toISOString(), action: "rejected", note: "Style proof rejected by user" };
    await admin.from(run.target.table).update({ manifest }).eq("id", run.target.rowId);
    await admin.from("tile_pack_generation_jobs").update({
      status: "pending", normalized_path: null, attempts: [...((row.attempts as unknown[] | null) ?? []), attempt],
    }).eq("id", jobId);
    await appendPlanAttempt(runId, run.plan, job.id, "rejected", attempt);
    await admin.from("tile_pack_generation_runs").update({
      status: "proof_pending", completed_jobs: Math.max(0, Number(run.plan.jobs.filter((candidate) => candidate.status === "normalized").length) - 1),
    }).eq("id", runId);
    return json({ status: "proof_pending" });
  }
  return json({ error: "invalid_action" }, 409);
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const user = await requireUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  switch (body.action) {
    case "create": return createRun(user.id, body);
    case "create_library": return createLibraryRun(user, body);
    case "register_upload": return registerUpload(user.id, body);
    case "finalize_upload": return finalizeUpload(user.id, body);
    case "delete_pack": return deletePack(user.id, body);
    case "delete_library_pack": return deleteLibraryPack(user, body);
    case "publish_library_pack": return setLibraryPackStatus(user, body, true);
    case "unpublish_library_pack": return setLibraryPackStatus(user, body, false);
    case "generate": return generateSlot(user, body);
    case "complete": return completeSlot(user, body);
    case "approve_proof":
    case "cancel":
    case "retry_job": return updateRun(user, body);
    case "regenerate_job": return updateRun(user, body);
    default: return json({ error: "unknown_action" }, 400);
  }
}));
