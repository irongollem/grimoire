import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { createDraftManifest, createGenerationPlan, slotRelativePath, type GenerationAttempt, type GenerationJob, type GenerationPlan, type PackArtBible } from "../../../src/cartographer/authoringPlan.ts";
import { validatePack } from "../../../src/cartographer/validatePack.ts";
import type { TilePackManifest } from "../../../src/cartographer/packSchema.ts";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { generateImage } from "../_shared/imageGen.ts";
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

async function requireOwnedRun(runId: string, userId: string) {
  const { data } = await admin.from("tile_pack_generation_runs").select("*, user_tile_packs(*)")
    .eq("id", runId).eq("user_id", userId).maybeSingle();
  return data as null | {
    id: string;
    user_id: string;
    campaign_id: string;
    tile_pack_id: string;
    status: string;
    cancel_requested: boolean;
    plan: GenerationPlan;
    charged_credits: number;
    user_tile_packs: { user_id: string; pack_id: string; pack_version: number; manifest: TilePackManifest };
  };
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

/**
 * The approved proof tiles, as image-input style references.
 *
 * `style_ref_path` is a 256x256 reduction and is what should be sent: measured
 * at ~1500 input tokens per 1024x1024 reference, three full-resolution raws cost
 * about five times the tile they help produce, on every call and every retry.
 * `raw_path` remains the fallback so a run started before 20260826215832 still
 * completes — correctly, just expensively.
 */
async function styleReferences(runId: string): Promise<Blob[]> {
  const { data } = await admin.from("tile_pack_generation_jobs").select("style_ref_path, raw_path")
    .eq("run_id", runId).eq("phase", "proof").eq("status", "normalized")
    .not("raw_path", "is", null).order("ordinal").limit(3);
  const blobs: Blob[] = [];
  for (const row of data ?? []) {
    const path = (row.style_ref_path as string | null) ?? (row.raw_path as string);
    const { data: file } = await admin.storage.from("tile-packs").download(path);
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

async function generateSlot(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isUserPro(admin, userId))) return json({ error: "pro_required" }, 403);
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const run = await requireOwnedRun(runId, userId);
  if (!run || !jobId) return json({ error: "run_not_found" }, 404);
  if (run.cancel_requested || ["cancelling", "cancelled", "completed"].includes(run.status)) {
    return json({ error: "run_not_active" }, 409);
  }
  const campaign = await campaignForGeneration(run.campaign_id, userId);
  if (!campaign) return json({ error: "campaign_forbidden" }, 403);
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
  if (campaign.openai_api_key && await isUserPro(admin, campaign.user_id)) {
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
  const cost = isByok ? 0 : attemptCharge(baseCost, attemptsSoFar);
  const reservation = await reserveCredits(admin, userId, cost, "tile_pack_generation");
  if (!reservation.ok) {
    await admin.from("tile_pack_generation_jobs").update({ status: "pending" }).eq("id", jobId);
    return reservationFailureResponse(reservation);
  }

  try {
    const references = allowedPhase === "pack" ? await styleReferences(runId) : [];
    const result = await generateImage({
      provider: "openai",
      model: MODEL,
      apiKey,
      prompt: job.prompt.final_prompt,
      size: job.execution.requested_size,
      quality: QUALITY,
      sourceImages: references,
      background: job.mechanics.alpha === "transparent-outside-footprint" ? "transparent" : "opaque",
    });
    const attemptNumber = ((claimed.attempts as unknown[] | null)?.length ?? 0) + 1;
    const rawPath = `${run.user_tile_packs.user_id}/${run.user_tile_packs.pack_id}/v${run.user_tile_packs.pack_version}/raw/${job.id.replaceAll(":", "-")}-${attemptNumber}.webp`;
    const rawBytes = decodeBase64(result.b64);
    const { error: uploadError } = await admin.storage.from("tile-packs").upload(rawPath, rawBytes, {
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
    if (!isByok && cost === 0) await recordFreeGeneration(admin, userId, "tile_pack_generation", usage);
    else await recordGeneration(admin, userId, "tile_pack_generation", isByok, cost, usage);
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
    return json({ job_id: jobId, slot_id: job.id, image_b64: result.b64, content_type: result.contentType, mechanics: job.mechanics });
  } catch (error) {
    await releaseCredits(admin, reservation.ids);
    const message = error instanceof Error ? error.message : "Image generation failed";
    await admin.from("tile_pack_generation_jobs").update({ status: "failed", error: message }).eq("id", jobId);
    return json({ error: message }, 502);
  }
}

async function completeSlot(userId: string, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const imageB64 = typeof body.image_b64 === "string" ? body.image_b64 : "";
  const styleRefB64 = typeof body.style_ref_b64 === "string" ? body.style_ref_b64 : "";
  const run = await requireOwnedRun(runId, userId);
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
  const normalizedPath = `${run.user_tile_packs.user_id}/${run.user_tile_packs.pack_id}/v${run.user_tile_packs.pack_version}/${relative}`;
  const { error: uploadError } = await admin.storage.from("tile-packs").upload(normalizedPath, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const manifest = structuredClone(run.user_tile_packs.manifest);
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
    const candidate = `${run.user_tile_packs.user_id}/${run.user_tile_packs.pack_id}/v${run.user_tile_packs.pack_version}/style-ref/${job.id.replaceAll(":", "-")}.webp`;
    const { error: refError } = await admin.storage.from("tile-packs")
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
  await admin.from("user_tile_packs").update({ manifest }).eq("id", run.tile_pack_id);
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
    await admin.from("user_tile_packs").update({ status: validation.valid ? "ready" : "failed" }).eq("id", run.tile_pack_id);
  }
  await admin.from("tile_pack_generation_runs").update({
    completed_jobs: completed ?? 0,
    status,
    ...(status === "completed" || status === "cancelled" ? { completed_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
  return json({ status, completed_jobs: completed ?? 0, total_jobs: run.plan.jobs.length });
}

async function updateRun(userId: string, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const action = typeof body.action === "string" ? body.action : "";
  const run = await requireOwnedRun(runId, userId);
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
    if (row.normalized_path) await admin.storage.from("tile-packs").remove([row.normalized_path as string]);
    const manifest = structuredClone(run.user_tile_packs.manifest);
    manifest.assets[job.slot.category] = (manifest.assets[job.slot.category] ?? []).filter((slot) =>
      slot.variant !== job.slot.variant || slot.side !== job.slot.side
    );
    const attempt: GenerationAttempt = { at: new Date().toISOString(), action: "rejected", note: "Style proof rejected by user" };
    await admin.from("user_tile_packs").update({ manifest }).eq("id", run.tile_pack_id);
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
    case "register_upload": return registerUpload(user.id, body);
    case "finalize_upload": return finalizeUpload(user.id, body);
    case "delete_pack": return deletePack(user.id, body);
    case "generate": return generateSlot(user.id, body);
    case "complete": return completeSlot(user.id, body);
    case "approve_proof":
    case "cancel":
    case "retry_job": return updateRun(user.id, body);
    case "regenerate_job": return updateRun(user.id, body);
    default: return json({ error: "unknown_action" }, 400);
  }
}));
