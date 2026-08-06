/**
 * Simulacrum action endpoint (SIMULACRUM_PLAN.md §4): portrait → mini-style
 * image → Meshy 3D sculpt. One `minis` row IS the job (status machine +
 * Realtime), same trick as image_generation_jobs. Actions:
 *
 *   stylize  — (re-)roll the mini-style render, reserve+settle entity_image credits.
 *   sculpt   — first PAID Meshy task; reserves mini_sculpt credits, returns immediately.
 *   resculpt — free retry within the MAX_SCULPTS cap; no credit reserve.
 *   cancel   — abort an in-flight sculpt, release its reservation.
 *   delete   — remove a mini's storage folder + row (service-role only; the
 *              bucket has no client delete policy).
 *   set_base — recompose a READY mini onto a different base/scale from its
 *              stored raw (uncomposed) figure files. FREE — no Meshy re-run,
 *              no credit reserve (SIMULACRUM_PLAN.md §2 BASELESS decision,
 *              #542) — allowed in ANY simulacrum_config.mode, like cancel/
 *              delete, since it operates on an already-paid-for sculpt.
 *
 * Meshy tasks run multi-minute — longer than an edge isolate reliably lives —
 * so `sculpt`/`resculpt` only CREATE the task and write meshy_task_id; the
 * pg_cron-driven poll-meshy-jobs function finishes the job.
 *
 * PLATFORM KEYS ONLY: unlike every other AI generator in this app, Simulacrum
 * has no BYOK path (SIMULACRUM_PLAN.md §4) — the stylize step never reads a
 * campaign's stored key and isByok is always false.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
  sizeMultiplier,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob } from "../_shared/imageJob.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";
import { buildMiniStylizePrompt } from "../_shared/image-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry, fetchBytes, publicUrlFor } from "../_shared/storage-upload.ts";
import { deleteByPrefix } from "../_shared/storage-delete.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import { canStylize, canSculpt, canResculpt, meshyParamsForFormat, type MiniStatusB } from "../_shared/simulacrum.ts";
import { createImageTo3dTask, resolveMeshyKey } from "../_shared/mesh3d.ts";
import { getMiniBase, BASE_STORAGE_PREFIX } from "../_shared/mini-bases.ts";
import { composeStl, figureScaleFor } from "../_shared/mesh-compose.ts";
import { composeGlb, figureScaleForGlb } from "../_shared/glb-compose.ts";
import { parseBinaryStl, stlBounds } from "../_shared/stl.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_INSTRUCTIONS_LENGTH = 2_000;

type JsonFn = (body: unknown, status?: number) => Response;

// ── Source entity allowlist (mirrors ALLOWED_IMAGE_TARGETS's spirit: only
// these tables/columns may be read as a mini's portrait source) ────────────
type SourceTable = "npcs" | "monsters" | "party_members";
const SOURCE_TABLES: SourceTable[] = ["npcs", "monsters", "party_members"];
// monsters have no campaign_id column (the bestiary is a user-global library,
// not campaign-scoped) — deviation from a literal "every source row carries
// its own campaign_id" reading of the source table; the mini's campaign_id
// comes from the request body for monsters, and is cross-checked against the
// source row's own campaign_id for npcs/party_members.
const SOURCE_CONFIG: Record<SourceTable, { portraitColumn: string; hasCampaignId: boolean }> = {
  npcs: { portraitColumn: "portrait_url", hasCampaignId: true },
  monsters: { portraitColumn: "image_url", hasCampaignId: false },
  party_members: { portraitColumn: "portrait_url", hasCampaignId: true },
};

interface SourceRow {
  id: string;
  user_id: string;
  campaign_id?: string | null;
  name: string;
  portrait: string | null;
}

interface MiniRow {
  id: string;
  user_id: string;
  campaign_id: string | null;
  source_table: string;
  source_id: string;
  format: "print" | "vtt";
  status: MiniStatusB;
  stylized_image_url: string | null;
  stylize_job_id: string | null;
  meshy_task_id: string | null;
  sculpt_count: number;
  credits_spent: number;
  reservation_ids: string[] | null;
  error: string | null;
}

/**
 * Server-side feature gate: stylize/sculpt/resculpt spend credits or vendor
 * budget, so they must be dark unless the admin flipped the feature to "live" —
 * the client hides the UI in hidden/teaser, but the endpoint is the boundary.
 * cancel/delete stay allowed in any mode (cleanup of existing minis).
 */
async function isLiveMode(): Promise<boolean> {
  const { data } = await admin.from("simulacrum_config").select("mode").eq("id", 1).maybeSingle();
  return data?.mode === "live";
}

// ── Storage upload ───────────────────────────────────────────────────────────

async function uploadStyleImage(
  b64: string,
  contentType: string,
  userId: string,
  miniId: string,
  provider: string,
  model: string,
): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${userId}/${miniId}/style.webp`;
  // EU AI Act Art 50(2) — mark before upload, using the provider's true byte
  // format (contentType), not the ".webp" this pipeline requests but doesn't
  // always get back (see imageGen.ts's ImageGenResult.contentType).
  const prov: AiProvenance = { generatorType: "mini_style", provider, model, generatedAt: new Date().toISOString(), edited: false };
  const marked = markGeneratedImage(bin, contentType, prov);
  await uploadWithRetry(admin, "mini-models", path, marked, "image/webp");
  return publicUrlFor(admin, "mini-models", path);
}

// ── stylize ──────────────────────────────────────────────────────────────────

async function runStylize(args: {
  jobId: string;
  miniId: string;
  userId: string;
  provider: ImageProviderKey;
  model: string;
  apiKey: string;
  quality: string | null;
  prompt: string;
  portraitUrl: string;
  previousStatus: string;
  previousHadImage: boolean;
  isByok: boolean;
  cost: number;
  reservationIds: string[];
}): Promise<void> {
  const {
    jobId, miniId, userId, provider, model, apiKey, quality, prompt, portraitUrl,
    previousStatus, previousHadImage, isByok, cost, reservationIds,
  } = args;

  try {
    // The portrait is the mini's likeness reference — fed to the provider as
    // a source image (openai edits / gemini inline both accept references;
    // fal.ai is generate-only, which is exactly why it's excluded from the
    // provider choice in handleStylize below).
    let sourceImages: Blob[] | undefined;
    if (isSafeStorageUrl(portraitUrl)) {
      const res = await fetch(portraitUrl);
      if (res.ok) sourceImages = [await res.blob()];
    } else {
      console.warn("forge-mini: rejected unsafe portrait_url — proceeding without a reference image");
    }

    // boostStyle is deliberately OFF here (unlike scene/portrait generators):
    // its dramatic-lighting/chiaroscuro push fights the flat, evenly-lit,
    // plain-background render every mini format requires.
    const { b64, contentType, usage } = await generateImage({
      provider, model, apiKey, prompt, size: "1024x1024", quality, boostStyle: false, sourceImages,
    });

    const imageUrl = await uploadStyleImage(b64, contentType, userId, miniId, usage.provider, model);
    // Flip the mini BEFORE completing the image job: completeImageJob is the
    // client's unblock signal, and the post-wait refetch must never observe
    // status still "stylizing" (it would offer a sculpt the backend 409s).
    // Only the currently-linked job may publish a style image. This is the
    // second half of the atomic claim in handleStylize and prevents an old
    // worker from overwriting a newer re-roll after a delayed completion.
    const { data: completedMini } = await admin
      .from("minis")
      .update({ status: "image_ready", stylized_image_url: imageUrl, stylize_job_id: null, error: null })
      .eq("id", miniId)
      .eq("stylize_job_id", jobId)
      .select("id")
      .maybeSingle();
    if (!completedMini) {
      // The mini may have been deleted or this worker superseded after a
      // timeout. Never leave its reservation hanging just because the result
      // can no longer be published.
      await releaseCredits(admin, reservationIds);
      await failImageJob(admin, jobId, "Stylize result could not be published");
      return;
    }
    await completeImageJob(admin, jobId, imageUrl);

    await releaseCredits(admin, reservationIds);
    await recordGeneration(admin, userId, "entity_image", isByok, cost, {
      model,
      provider: usage.provider,
      image_count: 1,
      input_tokens: usage.input_tokens,
      input_image_tokens: usage.input_image_tokens || undefined,
      output_tokens: usage.output_tokens || undefined,
    }).catch(console.error);
  } catch (e) {
    await releaseCredits(admin, reservationIds);
    const message = e instanceof Error ? e.message : "Mini stylize failed";
    console.error("forge-mini stylize failed:", e);
    await failImageJob(admin, jobId, message);
    // A re-roll that fails must not clobber an already-accepted image: only
    // fall back to 'failed' when this mini never had a stylized image before.
    const fallbackStatus = previousHadImage ? previousStatus : "failed";
    await admin
      .from("minis")
      .update({ status: fallbackStatus, stylize_job_id: null, error: message.slice(0, 1000) })
      .eq("id", miniId)
      .eq("stylize_job_id", jobId);
  }
}

async function handleStylize(
  userId: string,
  body: Record<string, unknown>,
  json: JsonFn,
): Promise<Response> {
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : null;
  const sourceTable = body.source_table as SourceTable;
  const sourceId = typeof body.source_id === "string" ? body.source_id : null;
  const format = body.format as "print" | "vtt";
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : undefined;

  if (!campaignId || !sourceId || !SOURCE_TABLES.includes(sourceTable) || (format !== "print" && format !== "vtt")) {
    return json({ error: "invalid_body" }, 400);
  }
  if (instructions && instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return json({ error: "instructions_too_long" }, 400);
  }

  // image_generation_jobs.campaign_id is NOT NULL + FK'd to campaigns, so the
  // campaign must exist and the caller must have access to it regardless of
  // whether the source table itself carries a campaign_id (monsters don't).
  // The campaign and source reads are independent — fetch them together.
  const cfg = SOURCE_CONFIG[sourceTable];
  const selectCols = cfg.hasCampaignId
    ? `id, user_id, campaign_id, name, portrait:${cfg.portraitColumn}`
    : `id, user_id, name, portrait:${cfg.portraitColumn}`;
  const [{ data: campaign }, { data: sourceRaw }] = await Promise.all([
    admin.from("campaigns").select("id, user_id, ai_enabled").eq("id", campaignId).maybeSingle(),
    admin.from(sourceTable).select(selectCols).eq("id", sourceId).maybeSingle(),
  ]);
  if (!campaign) return json({ error: "not_found" }, 404);
  if (campaign.user_id !== userId) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle();
    if (!membership) return json({ error: "forbidden" }, 403);
  }
  // Same ai_enabled gate every other generator enforces (mirrored here rather
  // than shared because forge-mini fetches campaigns with a bespoke select
  // list) — tri-state: null (never chosen) must block same as false.
  if (campaign.ai_enabled !== true) return json({ error: "ai_disabled" }, 403);

  if (!sourceRaw) return json({ error: "not_found" }, 404);
  const source = sourceRaw as unknown as SourceRow;
  if (source.user_id !== userId) return json({ error: "forbidden" }, 403);
  if (cfg.hasCampaignId && source.campaign_id !== campaignId) return json({ error: "not_found" }, 404);
  if (!source.portrait) return json({ error: "no_portrait" }, 400);

  let mini: MiniRow;
  let createdMini = false;
  if (miniId) {
    const { data: existing } = await admin.from("minis").select("*").eq("id", miniId).maybeSingle();
    if (!existing) return json({ error: "not_found" }, 404);
    mini = existing as MiniRow;
    if (mini.user_id !== userId) return json({ error: "forbidden" }, 403);
    if (mini.stylize_job_id) {
      const { data: activeJob } = await admin
        .from("image_generation_jobs")
        .select("status, error")
        .eq("id", mini.stylize_job_id)
        .maybeSingle();
      if (activeJob?.status === "pending") return json({ error: "stylize_in_progress" }, 409);

      // A stale-job sweep can terminally fail the image job after its edge
      // worker died. Clear the orphaned link here so the next explicit retry
      // becomes a fresh, atomically claimed render rather than a permanent
      // "stylizing" mini.
      if (activeJob?.status === "failed") {
        await admin
          .from("minis")
          .update({ stylize_job_id: null, status: mini.stylized_image_url ? "image_ready" : "failed", error: activeJob.error ?? "Stylize failed" })
          .eq("id", mini.id)
          .eq("stylize_job_id", mini.stylize_job_id);
        mini = { ...mini, stylize_job_id: null, status: mini.stylized_image_url ? "image_ready" : "failed" };
      } else {
        return json({ error: "stylize_in_progress" }, 409);
      }
    }
    if (!canStylize(mini.status)) return json({ error: "invalid_state" }, 409);
  } else {
    const { data: inserted, error: insertErr } = await admin.from("minis").insert({
      user_id: userId,
      campaign_id: campaignId,
      source_table: sourceTable,
      source_id: sourceId,
      format,
      label: source.name,
      status: "stylizing",
    }).select("*").single();
    if (insertErr || !inserted) {
      console.error("forge-mini stylize: insert failed", insertErr);
      return json({ error: "insert_failed" }, 500);
    }
    mini = inserted as MiniRow;
    createdMini = true;
  }

  // Choose the platform image provider — openai first (matches the app-wide
  // default), gemini as fallback. fal.ai is never eligible: it's generate-only
  // and can't accept the source portrait as a reference.
  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "gemini"]),
  ]);
  const providerChoice: "openai" | "gemini" = platformKeys.openai ? "openai" : "gemini";
  const img = resolveImageProvider({
    imageProvider: providerChoice,
    campaignKeys: {}, // deliberately empty — never honor a campaign's stored key (no BYOK path)
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });
  if (!img) {
    if (createdMini) await admin.from("minis").update({ status: "failed", error: "No image provider configured" }).eq("id", mini.id);
    return json({ error: "no_image_provider" }, 422);
  }

  const baseCost = await fetchCreditCost(admin, "entity_image");
  const cost = Math.round(img.imageMultiplier * baseCost * sizeMultiplier("1024x1024") * 100) / 100;

  if (!(await checkRateLimit(admin, userId, "ai_generation"))) {
    if (createdMini) await admin.from("minis").update({ status: "failed", error: "Rate limited" }).eq("id", mini.id);
    return json({ error: "rate_limited" }, 429);
  }

  const reservation = await reserveCredits(admin, userId, cost, "entity_image");
  if (!reservation.ok) {
    if (createdMini) await admin.from("minis").update({ status: "failed", error: "Insufficient credits" }).eq("id", mini.id);
    return reservationFailureResponse(reservation);
  }

  const prompt = buildMiniStylizePrompt(format, source.name, instructions);

  let jobId: string;
  try {
    jobId = await createImageJob(admin, {
      user_id: userId,
      campaign_id: campaignId,
      kind: "mini_style",
      prompt: prompt.slice(0, 500),
      size: "1024x1024",
      model: img.model,
      provider: img.provider,
      target_table: "minis",
      target_id: mini.id,
      target_column: "stylized_image_url",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (createdMini) await admin.from("minis").update({ status: "failed", error: "Could not create style job" }).eq("id", mini.id);
    console.error("forge-mini stylize: createImageJob failed", e);
    return json({ error: "job_create_failed" }, 500);
  }

  // Claim the mini only after the job exists. The `stylize_job_id is null`
  // predicate is the concurrency boundary: a second tab may create a harmless
  // pending job, but cannot start a second paid provider render. Its hold and
  // unused job are immediately cleaned up below.
  const { data: claimed } = await admin
    .from("minis")
    .update({ status: "stylizing", stylize_job_id: jobId, error: null })
    .eq("id", mini.id)
    .is("stylize_job_id", null)
    .in("status", ["stylizing", "image_ready", "failed", "ready"])
    .select("id")
    .maybeSingle();
  if (!claimed) {
    await Promise.all([
      admin.from("image_generation_jobs").delete().eq("id", jobId),
      releaseCredits(admin, reservation.ids),
    ]);
    return json({ error: "stylize_in_progress" }, 409);
  }

  // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
  EdgeRuntime.waitUntil(runStylize({
    jobId,
    miniId: mini.id,
    userId,
    provider: img.provider,
    model: img.model,
    apiKey: img.apiKey,
    quality: img.imageQuality,
    prompt,
    portraitUrl: source.portrait,
    previousStatus: mini.status,
    previousHadImage: !!mini.stylized_image_url,
    isByok: img.isByok,
    cost,
    reservationIds: reservation.ids,
  }));

  return json({ mini_id: mini.id, job_id: jobId });
}

// ── sculpt / resculpt ────────────────────────────────────────────────────────

/**
 * One handler for both sculpt flavors — `paid` selects the state gate and
 * whether the reserve/rollback block runs; everything else is identical, so
 * the two flavors can never silently diverge.
 */
async function handleSculptAction(
  userId: string,
  body: Record<string, unknown>,
  json: JsonFn,
  paid: boolean,
): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return json({ error: "invalid_body" }, 400);

  const { data: existing } = await admin
    .from("minis")
    .select("id, user_id, campaign_id, format, status, stylized_image_url, sculpt_count")
    .eq("id", miniId)
    .maybeSingle();
  if (!existing) return json({ error: "not_found" }, 404);
  const mini = existing as Pick<MiniRow, "id" | "user_id" | "campaign_id" | "format" | "status" | "stylized_image_url" | "sculpt_count">;
  if (mini.user_id !== userId) return json({ error: "forbidden" }, 403);
  // Same ai_enabled gate as handleStylize — sculpt/resculpt call Meshy (AI)
  // regardless of `paid`, so both need the same tri-state check (null must
  // block, same as false). The mini's own campaign_id (set at stylize time)
  // is the source of truth here, not a request-supplied campaign id.
  {
    const { data: campaign } = mini.campaign_id
      ? await admin.from("campaigns").select("ai_enabled").eq("id", mini.campaign_id).maybeSingle()
      : { data: null };
    if (campaign?.ai_enabled !== true) return json({ error: "ai_disabled" }, 403);
  }
  const gate = paid ? canSculpt : canResculpt;
  if (!gate({ status: mini.status, sculpt_count: mini.sculpt_count })) return json({ error: "invalid_state" }, 409);
  if (!mini.stylized_image_url) return json({ error: "invalid_state" }, 409);

  // Atomic claim: flip to "sculpting" only if the row still looks exactly like
  // what we just validated. A concurrent double-submit loses this update (0
  // rows) and 409s instead of double-reserving credits / orphaning a second
  // paid Meshy task.
  const { data: claimed } = await admin
    .from("minis")
    .update({
      status: "sculpting",
      error: null,
      sculpt_started_at: new Date().toISOString(),
      download_started_at: null,
      poll_lease_id: null,
      poll_lease_until: null,
      poll_last_error: null,
    })
    .eq("id", miniId)
    .eq("status", mini.status)
    .eq("sculpt_count", mini.sculpt_count)
    .select("id");
  if (!claimed?.length) return json({ error: "invalid_state" }, 409);

  const revert = (fields: Record<string, unknown> = {}) =>
    admin.from("minis").update({
      status: mini.status,
      sculpt_started_at: null,
      download_started_at: null,
      poll_lease_id: null,
      poll_lease_until: null,
      poll_last_error: null,
      ...fields,
    }).eq("id", miniId);

  let reservationIds: string[] = [];
  if (paid) {
    const cost = await fetchCreditCost(admin, "mini_sculpt"); // flat — no size/provider multipliers
    const reservation = await reserveCredits(admin, userId, cost, "mini_sculpt");
    if (!reservation.ok) {
      await revert();
      return reservationFailureResponse(reservation);
    }
    reservationIds = reservation.ids;
    await admin.from("minis").update({ reservation_ids: reservationIds, credits_spent: cost }).eq("id", miniId);
  }

  const meshyKey = await resolveMeshyKey(admin);
  if (!meshyKey) {
    // Live guard: Meshy isn't subscribed to yet (SIMULACRUM_PLAN.md §7).
    if (reservationIds.length) await releaseCredits(admin, reservationIds);
    await revert(paid ? { reservation_ids: null, credits_spent: 0 } : {});
    return json({ error: "meshy_unavailable" }, 503);
  }

  let taskId: string;
  try {
    taskId = await createImageTo3dTask(meshyKey, mini.stylized_image_url, meshyParamsForFormat(mini.format));
  } catch (e) {
    if (reservationIds.length) await releaseCredits(admin, reservationIds);
    const message = e instanceof Error ? e.message : "Meshy task creation failed";
    console.error(`forge-mini ${paid ? "sculpt" : "resculpt"}: createImageTo3dTask failed`, e);
    await revert({
      ...(paid ? { reservation_ids: null, credits_spent: 0 } : {}),
      error: message.slice(0, 1000),
    });
    return json({ error: "meshy_task_failed" }, 502);
  }

  await admin.from("minis").update({ meshy_task_id: taskId }).eq("id", miniId);
  return json({ mini_id: miniId, status: "sculpting" });
}

// ── cancel / delete ──────────────────────────────────────────────────────────

async function handleCancel(userId: string, body: Record<string, unknown>, json: JsonFn): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return json({ error: "invalid_body" }, 400);

  const { data: existing } = await admin.from("minis").select("*").eq("id", miniId).maybeSingle();
  if (!existing) return json({ error: "not_found" }, 404);
  const mini = existing as MiniRow;
  if (mini.user_id !== userId) return json({ error: "forbidden" }, 403);
  if (mini.status !== "sculpting") return json({ error: "invalid_state" }, 409);

  // Refund policy (matches every other AI generation): credits come back only
  // when the failure is OURS. A user-initiated cancel abandons a Meshy task we
  // still pay for, so the hold SETTLES as a real charge and the attempt is
  // consumed (sculpt_count++) — their remaining re-sculpts stay free under the
  // bundle they already paid for.
  if (mini.reservation_ids?.length) {
    await releaseCredits(admin, mini.reservation_ids);
    await recordGeneration(admin, userId, "mini_sculpt", false, mini.credits_spent).catch(console.error);
  }

  await admin.from("minis").update({
    status: "image_ready",
    meshy_task_id: null,
    reservation_ids: null,
    sculpt_started_at: null,
    download_started_at: null,
    poll_lease_id: null,
    poll_lease_until: null,
    poll_last_error: null,
    sculpt_count: mini.sculpt_count + 1,
  }).eq("id", miniId);

  return json({ mini_id: miniId, status: "image_ready" });
}

async function handleDelete(userId: string, body: Record<string, unknown>, json: JsonFn): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return json({ error: "invalid_body" }, 400);

  const { data: existing } = await admin
    .from("minis").select("id, user_id, reservation_ids, credits_spent").eq("id", miniId).maybeSingle();
  if (!existing) return json({ error: "not_found" }, 404);
  const mini = existing as { id: string; user_id: string; reservation_ids: string[] | null; credits_spent: number };
  if (mini.user_id !== userId) return json({ error: "forbidden" }, 403);

  // Service-role-only cleanup: clients have no storage write/delete policy on
  // mini-models (SIMULACRUM_PLAN.md §3), so this is the only deletion path.
  //
  // Via deleteByPrefix because mini-models bytes live in R2 (#577 stage 2):
  // listing Supabase alone returns nothing for an R2-stored mini, so this would
  // report a clean delete while orphaning every file the user just paid for.
  //
  // Ordering matters twice here:
  //   1. Cleanup runs BEFORE credit settlement, so a failed cleanup can return
  //      an error and be retried without settling twice — recordGeneration is
  //      an analytics append, and a retry that re-ran it would double-count.
  //   2. A cleanup failure FAILS the request rather than being logged past —
  //      deleteByPrefix throws precisely so the row (the only thing that still
  //      names `{userId}/{miniId}/`) survives to drive the retry. Swallowing it
  //      and deleting the row would orphan up to 50 MB per format in R2 with
  //      nothing left pointing at it.
  try {
    await deleteByPrefix(admin, "mini-models", `${userId}/${miniId}`);
  } catch (err) {
    console.error("forge-mini delete: storage cleanup failed", err);
    return json({ error: "storage_cleanup_failed" }, 502);
  }

  // Deleting mid-sculpt must not strand the credit hold — but it SETTLES, not
  // refunds: destroying an in-flight paid task is the user's choice, and
  // credits only come back when the failure is ours (refund policy).
  if (mini.reservation_ids?.length) {
    await releaseCredits(admin, mini.reservation_ids);
    await recordGeneration(admin, userId, "mini_sculpt", false, mini.credits_spent).catch(console.error);
  }

  const { error: deleteErr } = await admin.from("minis").delete().eq("id", miniId);
  if (deleteErr) {
    console.error("forge-mini delete: row delete failed", deleteErr);
    return json({ error: "delete_failed" }, 500);
  }

  return json({ ok: true });
}

// ── set_base ──────────────────────────────────────────────────────────────────

interface SetBaseMiniRow {
  id: string;
  user_id: string;
  status: MiniStatusB;
  glb_path: string | null;
  stl_path: string | null;
  extra_paths: Record<string, string> | null;
}

/**
 * Recomposes a READY mini onto a different base/scale from its stored raw
 * (uncomposed) figure files — never re-runs Meshy. FREE: composition is pure
 * CPU work on files we already own, not vendor spend, so there's nothing to
 * reserve/settle/refund (contrast with sculpt/resculpt). Falls back to the
 * current model.* files if extra_paths.raw_glb/raw_stl are missing (minis
 * forged before this feature shipped, or a mini whose auto-compose fell back
 * to raw-as-model) — recomposing an ALREADY-composed figure onto a new base
 * is wrong (the old base geometry would get baked in), so that fallback is
 * only correct when the current model.* is itself still figure-only. Minis
 * with no raw copies and an already-composed model are simply out of luck
 * until they're re-sculpted (which re-populates extra_paths.raw_*).
 */
async function handleSetBase(userId: string, body: Record<string, unknown>, json: JsonFn): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  const baseId = typeof body.base_id === "string" ? body.base_id : null;
  const scaleMm = body.scale_mm === 28 || body.scale_mm === 32 ? (body.scale_mm as 28 | 32) : null;
  if (!miniId || !baseId || !scaleMm) return json({ error: "invalid_body" }, 400);

  if (!getMiniBase(baseId)) return json({ error: "unknown_base" }, 400);

  const { data: existing } = await admin
    .from("minis")
    .select("id, user_id, status, glb_path, stl_path, extra_paths")
    .eq("id", miniId)
    .maybeSingle();
  if (!existing) return json({ error: "not_found" }, 404);
  const mini = existing as SetBaseMiniRow;
  if (mini.user_id !== userId) return json({ error: "forbidden" }, 403);
  if (mini.status !== "ready") return json({ error: "invalid_state" }, 409);

  const extraPaths = mini.extra_paths ?? {};
  const figureGlbPath = extraPaths.raw_glb ?? mini.glb_path;
  const figureStlPath = extraPaths.raw_stl ?? mini.stl_path;
  if (!figureGlbPath) return json({ error: "invalid_state" }, 409); // nothing to recompose from

  // publicUrlFor, not getPublicUrl: mini-models is R2-backed (#577 stage 2), so
  // the origin URL these bytes are re-fetched from would 404.
  const toPublicUrl = (path: string) => publicUrlFor(admin, "mini-models", path);

  try {
    const [figureGlbBytes, figureStlBytes, baseGlbBytes, baseStlBytes] = await Promise.all([
      fetchBytes(toPublicUrl(figureGlbPath)),
      figureStlPath ? fetchBytes(toPublicUrl(figureStlPath)).catch(() => null) : Promise.resolve(null),
      fetchBytes(toPublicUrl(`${BASE_STORAGE_PREFIX}/${baseId}.glb`)),
      fetchBytes(toPublicUrl(`${BASE_STORAGE_PREFIX}/${baseId}.stl`)).catch(() => null),
    ]);

    // One scale factor, reused for both exports — see poll-meshy-jobs'
    // composeMiniModel for why STL bounds are preferred when available.
    const scale = figureStlBytes
      ? figureScaleFor(stlBounds(parseBinaryStl(figureStlBytes)), scaleMm)
      : await figureScaleForGlb(figureGlbBytes, scaleMm);

    const composedGlb = await composeGlb(figureGlbBytes, baseGlbBytes, scaleMm, scale);
    const glbPath = `${userId}/${miniId}/model.glb`;
    await uploadWithRetry(admin, "mini-models", glbPath, composedGlb, "model/gltf-binary");

    let stlPath = mini.stl_path;
    if (figureStlBytes && baseStlBytes) {
      const composedStl = composeStl(figureStlBytes, baseStlBytes, scaleMm);
      stlPath = `${userId}/${miniId}/model.stl`;
      await uploadWithRetry(admin, "mini-models", stlPath, composedStl, "model/stl");
    }

    await admin.from("minis").update({
      base_id: baseId,
      scale_mm: scaleMm,
      glb_path: glbPath,
      stl_path: stlPath,
    }).eq("id", miniId);
  } catch (e) {
    console.error("forge-mini set_base: composition failed", e);
    return json({ error: "compose_failed" }, 502);
  }

  return json({ mini_id: miniId, base_id: baseId, scale_mm: scaleMm });
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  const json: JsonFn = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  // Frozen accounts cannot generate — Simulacrum has no BYOK path to worry
  // about skipping the credit gate, but the freeze must still block sculpt/
  // resculpt/stylize alike.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  // Spending actions are dark unless the feature is "live" — the endpoint, not
  // the client, is the gate (hidden/teaser must not be bypassable for credits).
  const spends = body.action === "stylize" || body.action === "sculpt" || body.action === "resculpt";
  if (spends && !(await isLiveMode())) return json({ error: "feature_disabled" }, 403);

  // EU AI Act Art 50(1) likeness backstop — stylize sends the source portrait
  // to the provider, sculpt sends the stylized render to Meshy; both are
  // portrait flows per context/compliance/provenance-architecture.md §3.
  // resculpt/cancel/delete/set_base never send a NEW portrait, so they're
  // exempt. Cheap, early, before any credit reservation. Client pre-flights
  // the identical check via useLikenessGate — this rarely actually fires.
  const needsLikenessAck = body.action === "stylize" || body.action === "sculpt";
  if (needsLikenessAck && !(await hasLikenessAcknowledgement(admin, user.id))) {
    return json({ error: "likeness_acknowledgement_required" }, 403);
  }

  switch (body.action) {
    case "stylize":  return handleStylize(user.id, body, json);
    case "sculpt":   return handleSculptAction(user.id, body, json, true);
    case "resculpt": return handleSculptAction(user.id, body, json, false);
    case "cancel":   return handleCancel(user.id, body, json);
    case "delete":   return handleDelete(user.id, body, json);
    case "set_base": return handleSetBase(user.id, body, json);
    default:         return json({ error: "invalid_action" }, 400);
  }
}));
