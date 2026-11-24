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
 * Platform keys only, like every AI generator in this app.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob } from "../_shared/imageJob.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { buildMiniStylizePrompt } from "../_shared/image-prompt.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { settleHandedOff, withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry, fetchBytes, publicUrlFor } from "../_shared/storage-upload.ts";
import { deleteByPrefix } from "../_shared/storage-delete.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { registerImageProvenance } from "../_shared/provenance/register.ts";
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

type Report = (err: unknown) => void;

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
  const { data, error } = await admin.from("simulacrum_config").select("mode").eq("id", 1).maybeSingle();
  if (error) throw error;
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
  // The registry is how the UI finds this image's provenance. A failure here
  // must not waste a paid generation whose bytes are already stored: the mark
  // inside the file is the disclosure of record, and the backfill scan repairs
  // a missed row. A re-style overwrites this fixed path, so the row is upserted.
  try {
    await registerImageProvenance(admin, "mini-models", path, userId, prov);
  } catch (err) {
    console.error(`image_provenance registration failed for mini-models/${path}`, err);
  }
  return publicUrlFor(admin, "mini-models", path);
}

// ── stylize ──────────────────────────────────────────────────────────────────

/** The mini was deleted or this worker superseded: the image was made but cannot be shown. */
class StylizeNotPublished extends Error {
  constructor() {
    super("Stylize result could not be published");
  }
}

async function runStylize(args: {
  jobId: string;
  miniId: string;
  userId: string;
  provider: ImageProviderKey;
  model: string;
  apiKey: string;
  moderationKey: string | null;
  quality: string | null;
  prompt: string;
  portraitUrl: string;
  previousStatus: string;
  previousHadImage: boolean;
  cost: number;
  reservationIds: string[];
  report: Report;
}): Promise<void> {
  const {
    jobId, miniId, userId, provider, model, apiKey, moderationKey, quality, prompt, portraitUrl,
    previousStatus, previousHadImage, cost, reservationIds, report,
  } = args;

  // True once the style image is published on the mini: from then on it is delivered and charged, and nothing that
  // throws afterwards may call the job failed (the hand-wired worker did, #1234).
  let published = false;
  let imageUrl = "";
  try {
    await settleHandedOff(admin, { payerId: userId, ids: reservationIds, report }, async (ledger) => {
      // The portrait is the mini's likeness reference — fed to the provider as
      // a source image (openai edits / gemini inline both accept references).
      // A generate-only provider could never serve this path, which is why
      // handleStylize below picks from the reference-capable providers only.
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
        screening: { apiKey: moderationKey, admin, userId, generationType: "mini_style" },
      });
      // Queued the moment the provider answered. If the image then cannot be published the work throws, and the hold
      // writes this line free: the provider's spend stays on the books and the user is not charged.
      ledger.charge("entity_image", {
        cost,
        log: {
          model,
          quality,
          size: "1024x1024",
          provider: usage.provider,
          image_count: 1,
          input_tokens: usage.input_tokens,
          input_image_tokens: usage.input_image_tokens || undefined,
          output_tokens: usage.output_tokens || undefined,
        },
      });

      imageUrl = await uploadStyleImage(b64, contentType, userId, miniId, usage.provider, model);
      // Flip the mini BEFORE completing the image job: completeImageJob is the
      // client's unblock signal, and the post-wait refetch must never observe
      // status still "stylizing" (it would offer a sculpt the backend 409s).
      // Only the currently-linked job may publish a style image. This is the
      // second half of the atomic claim in handleStylize and prevents an old
      // worker from overwriting a newer re-roll after a delayed completion.
      const { data: completedMini, error: publishErr } = await admin
        .from("minis")
        .update({ status: "image_ready", stylized_image_url: imageUrl, stylize_job_id: null, error: null })
        .eq("id", miniId)
        .eq("stylize_job_id", jobId)
        .select("id")
        .maybeSingle();
      if (publishErr) throw publishErr;
      if (!completedMini) throw new StylizeNotPublished();
      published = true;
    });
  } catch (e) {
    if (published) {
      console.error("forge-mini stylize: settling after a published image failed", e);
      report(e);
    } else {
      const message = e instanceof Error ? e.message : "Mini stylize failed";
      console.error("forge-mini stylize failed:", e);
      try {
        await failImageJob(admin, jobId, message);
        // A re-roll that fails must not clobber an already-accepted image: only
        // fall back to 'failed' when this mini never had a stylized image before.
        const fallbackStatus = previousHadImage ? previousStatus : "failed";
        const { error: fallbackErr } = await admin
          .from("minis")
          .update({ status: fallbackStatus, stylize_job_id: null, error: message.slice(0, 1000) })
          .eq("id", miniId)
          .eq("stylize_job_id", jobId);
        if (fallbackErr) throw fallbackErr;
      } catch (failErr) {
        console.error("forge-mini stylize: could not record the failure", failErr);
        report(failErr);
      }
      return;
    }
  }

  try {
    await completeImageJob(admin, jobId, imageUrl);
  } catch (e) {
    console.error("forge-mini stylize: completeImageJob failed after the image was published", e);
    report(e);
  }
}

async function handleStylize(userId: string, body: Record<string, unknown>, report: Report): Promise<Response> {
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : null;
  const sourceTable = body.source_table as SourceTable;
  const sourceId = typeof body.source_id === "string" ? body.source_id : null;
  const format = body.format as "print" | "vtt";
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : undefined;

  if (!campaignId || !sourceId || !SOURCE_TABLES.includes(sourceTable) || (format !== "print" && format !== "vtt")) {
    return jsonError(400, "invalid_body", "Name the campaign, the source and the format for the mini.");
  }
  if (instructions && instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return jsonError(400, "instructions_too_long", `Keep the instructions under ${MAX_INSTRUCTIONS_LENGTH} characters.`);
  }

  // image_generation_jobs.campaign_id is NOT NULL + FK'd to campaigns, so the
  // campaign must exist and the caller must have access to it regardless of
  // whether the source table itself carries a campaign_id (monsters don't).
  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign(admin, campaignId, userId);
  if (!load.ok) return load.response;

  const cfg = SOURCE_CONFIG[sourceTable];
  const selectCols = cfg.hasCampaignId
    ? `id, user_id, campaign_id, name, portrait:${cfg.portraitColumn}`
    : `id, user_id, name, portrait:${cfg.portraitColumn}`;
  const { data: sourceRaw, error: sourceErr } = await admin.from(sourceTable).select(selectCols).eq("id", sourceId).maybeSingle();
  if (sourceErr) throw sourceErr;
  if (!sourceRaw) return jsonError(404, "not_found", "The source for this mini could not be found.");
  const source = sourceRaw as unknown as SourceRow;
  if (source.user_id !== userId) return jsonError(403, "forbidden", "You can only forge a mini from your own entity.");
  if (cfg.hasCampaignId && source.campaign_id !== campaignId) return jsonError(404, "not_found", "The source for this mini could not be found.");
  if (!source.portrait) return jsonError(400, "no_portrait", "Add a portrait before forging a mini.");

  // A re-roll names its mini; check it before anything is spent. A first forge has no row yet: it is inserted inside
  // the hold below, so a refused reservation never leaves a "stylizing" row behind.
  let mini: MiniRow | null = null;
  if (miniId) {
    const { data: existing, error: existingErr } = await admin.from("minis").select("*").eq("id", miniId).maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing) return jsonError(404, "not_found", "That mini could not be found.");
    mini = existing as MiniRow;
    if (mini.user_id !== userId) return jsonError(403, "forbidden", "That mini is not yours.");
    if (mini.stylize_job_id) {
      const { data: activeJob, error: activeErr } = await admin
        .from("image_generation_jobs")
        .select("status, error")
        .eq("id", mini.stylize_job_id)
        .maybeSingle();
      if (activeErr) throw activeErr;
      if (activeJob?.status === "pending") return jsonError(409, "stylize_in_progress", "This mini is already being styled.");

      // A stale-job sweep can terminally fail the image job after its edge
      // worker died. Clear the orphaned link here so the next explicit retry
      // becomes a fresh, atomically claimed render rather than a permanent
      // "stylizing" mini.
      if (activeJob?.status === "failed") {
        const { error: clearErr } = await admin
          .from("minis")
          .update({ stylize_job_id: null, status: mini.stylized_image_url ? "image_ready" : "failed", error: activeJob.error ?? "Stylize failed" })
          .eq("id", mini.id)
          .eq("stylize_job_id", mini.stylize_job_id);
        if (clearErr) throw clearErr;
        mini = { ...mini, stylize_job_id: null, status: mini.stylized_image_url ? "image_ready" : "failed" };
      } else {
        return jsonError(409, "stylize_in_progress", "This mini is already being styled.");
      }
    }
    if (!canStylize(mini.status)) return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");
  }

  // Choose the platform image provider — openai first (matches the app-wide
  // default), gemini as fallback. Both accept the source portrait as a
  // reference, which this path requires: a generate-only provider is never
  // eligible here.
  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "gemini"]),
  ]);
  const providerChoice: "openai" | "gemini" = platformKeys.openai ? "openai" : "gemini";
  const img = resolveImageProvider({
    imageProvider: providerChoice,
    pinned: true, // reference-image forging needs this provider's capability, so the image_enabled switch does not apply
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });
  if (!img) return jsonError(422, "no_image_provider", "Image generation is not available right now.");

  if (!(await checkRateLimit(admin, userId, "ai_generation"))) return rateLimited();

  // Everything that can throw is computed before the mini row is inserted and before the hold is taken.
  const baseCost = await fetchCreditCost(admin, "entity_image");
  const cost = wholeCredits(img.imageMultiplier * baseCost * sizeMultiplier("1024x1024"));
  const quality = await resolveImageQuality(admin, "entity_image", img);
  const prompt = buildMiniStylizePrompt(format, source.name, instructions);

  return withCreditHold(admin, { payerId: userId, reason: "entity_image", cost, report }, async (hold) => {
    let createdMini = false;
    if (!mini) {
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
        return jsonError(500, "insert_failed", "The mini could not be started. Please try again.");
      }
      mini = inserted as MiniRow;
      createdMini = true;
    }
    const target = mini;
    const failNew = (why: string) =>
      createdMini ? admin.from("minis").update({ status: "failed", error: why }).eq("id", target.id) : Promise.resolve();

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
        target_id: target.id,
        target_column: "stylized_image_url",
      });
    } catch (e) {
      await failNew("Could not create style job");
      console.error("forge-mini stylize: createImageJob failed", e);
      return jsonError(500, "job_create_failed", "The style render could not be started. Please try again.");
    }

    // Claim the mini only after the job exists. The `stylize_job_id is null`
    // predicate is the concurrency boundary: a second tab may create a harmless
    // pending job, but cannot start a second paid provider render. Its hold and
    // unused job are immediately cleaned up below.
    const { data: claimed, error: claimErr } = await admin
      .from("minis")
      .update({ status: "stylizing", stylize_job_id: jobId, error: null })
      .eq("id", target.id)
      .is("stylize_job_id", null)
      .in("status", ["stylizing", "image_ready", "failed", "ready"])
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) {
      await admin.from("image_generation_jobs").delete().eq("id", jobId);
      if (claimErr) {
        console.error("forge-mini stylize: claim failed", claimErr);
        await failNew("Could not start the style render");
        return jsonError(500, "claim_failed", "The style render could not be started. Please try again.");
      }
      return jsonError(409, "stylize_in_progress", "This mini is already being styled.");
    }

    // The worker owns the hold from here.
    const run = runStylize({
      jobId,
      miniId: target.id,
      userId,
      provider: img.provider,
      model: img.model,
      apiKey: img.apiKey,
      moderationKey: img.moderationKey,
      quality,
      prompt,
      portraitUrl: source.portrait!,
      previousStatus: target.status,
      previousHadImage: !!target.stylized_image_url,
      cost,
      reservationIds: hold.handOff(),
      report,
    });
    try {
      // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
      EdgeRuntime.waitUntil(run);
    } catch (e) {
      // The worker is already running; only the keep-alive failed.
      console.error("forge-mini stylize: waitUntil failed", e);
      report(e);
    }
    return json({ mini_id: target.id, job_id: jobId });
  });
}

// ── sculpt / resculpt ────────────────────────────────────────────────────────

/**
 * One handler for both sculpt flavors — `paid` selects the state gate and
 * whether the hold runs; everything else is identical, so the two flavors can
 * never silently diverge.
 */
async function handleSculptAction(
  userId: string,
  body: Record<string, unknown>,
  paid: boolean,
  report: Report,
): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return jsonError(400, "invalid_body", "Name the mini to sculpt.");

  const { data: existing, error: existingErr } = await admin
    .from("minis")
    .select("id, user_id, campaign_id, format, status, stylized_image_url, sculpt_count")
    .eq("id", miniId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing) return jsonError(404, "not_found", "That mini could not be found.");
  const mini = existing as Pick<MiniRow, "id" | "user_id" | "campaign_id" | "format" | "status" | "stylized_image_url" | "sculpt_count">;
  if (mini.user_id !== userId) return jsonError(403, "forbidden", "That mini is not yours.");
  // Sculpt/resculpt call Meshy (AI) regardless of `paid`, so both need the campaign's AI switch (null blocks, same as
  // false) and the caller must still be a DM of that campaign: owning the mini is not enough once they have left the
  // table. The mini's own campaign_id (set at stylize time) is the source of truth here, not a request-supplied one.
  if (!mini.campaign_id) return jsonError(403, "ai_disabled", "AI is turned off for this campaign.");
  const load = await loadAiCampaign(admin, mini.campaign_id, userId);
  if (!load.ok) return load.response;

  const gate = paid ? canSculpt : canResculpt;
  if (!gate({ status: mini.status, sculpt_count: mini.sculpt_count })) return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");
  if (!mini.stylized_image_url) return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");
  const stylizedImageUrl = mini.stylized_image_url;

  if (!(await checkRateLimit(admin, userId, "ai_generation"))) return rateLimited();

  // Live guard: Meshy isn't subscribed to yet (SIMULACRUM_PLAN.md §7). Resolved, like the cost, before the row is
  // claimed and before anything is held, so there is nothing to undo when it is missing or throws.
  const meshyKey = await resolveMeshyKey(admin);
  if (!meshyKey) return jsonError(503, "meshy_unavailable", "The sculpting service is temporarily unavailable. Please try again shortly.");
  const cost = paid ? wholeCredits(await fetchCreditCost(admin, "mini_sculpt")) : 0; // flat — no size/provider multipliers

  // Atomic claim: flip to "sculpting" only if the row still looks exactly like
  // what we just validated. A concurrent double-submit loses this update (0
  // rows) and 409s instead of double-reserving credits / orphaning a second
  // paid Meshy task.
  const { data: claimed, error: claimErr } = await admin
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
  if (claimErr) throw claimErr;
  if (!claimed?.length) return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");

  const revert = async (fields: Record<string, unknown> = {}) => {
    const { error } = await admin.from("minis").update({
      status: mini.status,
      sculpt_started_at: null,
      download_started_at: null,
      poll_lease_id: null,
      poll_lease_until: null,
      poll_last_error: null,
      ...fields,
    }).eq("id", miniId);
    if (error) throw error;
  };

  const createTask = async (): Promise<string | Response> => {
    try {
      return await createImageTo3dTask(meshyKey, stylizedImageUrl, meshyParamsForFormat(mini.format));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Meshy task creation failed";
      console.error(`forge-mini ${paid ? "sculpt" : "resculpt"}: createImageTo3dTask failed`, e);
      await revert({ error: message.slice(0, 1000) });
      return jsonError(502, "meshy_task_failed", "The sculpting service could not start the task. Please try again.");
    }
  };

  // The row is claimed: whatever throws from here on puts it back, so it is never stranded in "sculpting".
  try {
    if (!paid) {
      const taskId = await createTask();
      if (taskId instanceof Response) return taskId;
      const { error } = await admin.from("minis").update({ meshy_task_id: taskId }).eq("id", miniId);
      if (error) throw error;
      return json({ mini_id: miniId, status: "sculpting" });
    }

    return await withCreditHold(admin, { payerId: userId, reason: "mini_sculpt", cost, report }, async (hold) => {
      const taskId = await createTask();
      if (taskId instanceof Response) return taskId; // the hold is released: nothing was sculpted
      // The row owns the hold from here: the poller (or cancel/delete) settles it from `reservation_ids`. The ids only
      // exist once the hold is handed off, so if the row cannot be written they are released on the spot.
      const reservationIds = hold.handOff();
      const { error } = await admin
        .from("minis")
        .update({ meshy_task_id: taskId, reservation_ids: reservationIds, credits_spent: cost })
        .eq("id", miniId);
      if (error) {
        await settleHandedOff(admin, { payerId: userId, ids: reservationIds, report }, async () => undefined);
        throw error;
      }
      return json({ mini_id: miniId, status: "sculpting" });
    });
  } catch (e) {
    try {
      await revert();
    } catch (revertErr) {
      console.error("forge-mini sculpt: could not put the mini back", revertErr);
      report(revertErr);
    }
    throw e;
  }
}

// ── cancel / delete ──────────────────────────────────────────────────────────

/**
 * Settle the hold a sculpt left on its row. Refund policy (matches every other AI generation): credits come back only
 * when the failure is OURS. A user-initiated cancel or delete abandons a Meshy task we still pay for, so the hold
 * SETTLES as a real charge, not a refund.
 */
function settleAbandonedSculpt(mini: { user_id: string; reservation_ids: string[] | null; credits_spent: number }, report: Report): Promise<void> {
  if (!mini.reservation_ids?.length) return Promise.resolve();
  return settleHandedOff(admin, { payerId: mini.user_id, ids: mini.reservation_ids, report }, async (ledger) => {
    ledger.charge("mini_sculpt", { cost: mini.credits_spent });
  });
}

async function handleCancel(userId: string, body: Record<string, unknown>, report: Report): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return jsonError(400, "invalid_body", "Name the mini to cancel.");

  const { data: existing, error: existingErr } = await admin.from("minis").select("*").eq("id", miniId).maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing) return jsonError(404, "not_found", "That mini could not be found.");
  const mini = existing as MiniRow;
  if (mini.user_id !== userId) return jsonError(403, "forbidden", "That mini is not yours.");
  if (mini.status !== "sculpting") return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");

  // The attempt is consumed (sculpt_count++) — their remaining re-sculpts stay free under the bundle they already
  // paid for.
  await settleAbandonedSculpt(mini, report);

  const { error: updateErr } = await admin.from("minis").update({
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
  if (updateErr) throw updateErr;

  return json({ mini_id: miniId, status: "image_ready" });
}

interface DeletableMini {
  id: string;
  user_id: string;
  reservation_ids: string[] | null;
  credits_spent: number;
}

/**
 * The one way a mini goes: its files, then its credit hold, then its row.
 * Returns an error code, or null once all three are done.
 */
async function removeMini(mini: DeletableMini, report: Report): Promise<"storage_cleanup_failed" | "delete_failed" | null> {
  // Service-role-only cleanup: clients have no storage write/delete policy on
  // mini-models (SIMULACRUM_PLAN.md §3), so this is the only deletion path.
  //
  // Via deleteByPrefix because mini-models bytes live in R2 (#577 stage 2):
  // listing Supabase alone returns nothing for an R2-stored mini, so this would
  // report a clean delete while orphaning every file the user just paid for.
  //
  // Ordering matters twice here:
  //   1. Cleanup runs BEFORE credit settlement, so a failed cleanup can return
  //      an error and be retried without settling twice — the ledger line is
  //      an analytics append, and a retry that re-ran it would double-count.
  //   2. A cleanup failure FAILS the request rather than being logged past —
  //      deleteByPrefix throws precisely so the row (the only thing that still
  //      names `{userId}/{miniId}/`) survives to drive the retry. Swallowing it
  //      and deleting the row would orphan up to 50 MB per format in R2 with
  //      nothing left pointing at it.
  try {
    await deleteByPrefix(admin, "mini-models", `${mini.user_id}/${mini.id}`);
  } catch (err) {
    console.error("forge-mini delete: storage cleanup failed", err);
    return "storage_cleanup_failed";
  }

  // Deleting mid-sculpt must not strand the credit hold — but it SETTLES, not
  // refunds: destroying an in-flight paid task is the user's choice, and
  // credits only come back when the failure is ours (refund policy).
  await settleAbandonedSculpt(mini, report);

  const { error: deleteErr } = await admin.from("minis").delete().eq("id", mini.id);
  if (deleteErr) {
    console.error("forge-mini delete: row delete failed", deleteErr);
    return "delete_failed";
  }
  return null;
}

const REMOVE_FAILURE = {
  storage_cleanup_failed: { status: 502, message: "The mini's files could not be removed. Please try again." },
  delete_failed: { status: 500, message: "The mini could not be deleted. Please try again." },
} as const;

async function handleDelete(userId: string, body: Record<string, unknown>, report: Report): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  if (!miniId) return jsonError(400, "invalid_body", "Name the mini to delete.");

  const { data: existing, error: existingErr } = await admin
    .from("minis").select("id, user_id, reservation_ids, credits_spent").eq("id", miniId).maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing) return jsonError(404, "not_found", "That mini could not be found.");
  const mini = existing as DeletableMini;
  if (mini.user_id !== userId) return jsonError(403, "forbidden", "That mini is not yours.");

  const failure = await removeMini(mini, report);
  if (failure) return jsonError(REMOVE_FAILURE[failure].status, failure, REMOVE_FAILURE[failure].message);
  return json({ ok: true });
}

/**
 * Every mini in a campaign about to be deleted, whoever made it (#963). The
 * campaign delete cascades the rows, and a row is the only thing that names
 * its `{userId}/{miniId}/` folder, so the files have to go first or never.
 * The campaign owner may do this to every member's minis because the delete
 * they are about to run removes those rows anyway; nobody else may.
 */
async function handleDeleteCampaign(userId: string, body: Record<string, unknown>, report: Report): Promise<Response> {
  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : null;
  if (!campaignId) return jsonError(400, "invalid_body", "Name the campaign.");

  const { data: campaign, error: campaignErr } = await admin
    .from("campaigns").select("user_id").eq("id", campaignId).maybeSingle();
  if (campaignErr) {
    console.error("forge-mini delete_campaign: campaign read failed", campaignErr);
    return jsonError(500, "delete_failed", REMOVE_FAILURE.delete_failed.message);
  }
  if (!campaign) return jsonError(404, "campaign_not_found", "Campaign not found.");
  if (campaign.user_id !== userId) return jsonError(403, "forbidden", "Only the campaign's owner can do this.");

  const { data: minis, error: minisErr } = await admin
    .from("minis").select("id, user_id, reservation_ids, credits_spent").eq("campaign_id", campaignId);
  if (minisErr || !minis) {
    console.error("forge-mini delete_campaign: minis read failed", minisErr);
    return jsonError(500, "delete_failed", REMOVE_FAILURE.delete_failed.message);
  }
  // One at a time: each settles a credit hold, and a failure stops here with
  // the rest of the rows intact for the retry.
  for (const mini of minis as DeletableMini[]) {
    const failure = await removeMini(mini, report);
    if (failure) return jsonError(REMOVE_FAILURE[failure].status, failure, REMOVE_FAILURE[failure].message);
  }
  return json({ ok: true, deleted: minis.length });
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
async function handleSetBase(userId: string, body: Record<string, unknown>): Promise<Response> {
  const miniId = typeof body.mini_id === "string" ? body.mini_id : null;
  const baseId = typeof body.base_id === "string" ? body.base_id : null;
  const scaleMm = body.scale_mm === 28 || body.scale_mm === 32 ? (body.scale_mm as 28 | 32) : null;
  if (!miniId || !baseId || !scaleMm) return jsonError(400, "invalid_body", "Name the mini, the base and the scale (28 or 32).");

  if (!getMiniBase(baseId)) return jsonError(400, "unknown_base", "That base is not available.");

  const { data: existing, error: existingErr } = await admin
    .from("minis")
    .select("id, user_id, status, glb_path, stl_path, extra_paths")
    .eq("id", miniId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing) return jsonError(404, "not_found", "That mini could not be found.");
  const mini = existing as SetBaseMiniRow;
  if (mini.user_id !== userId) return jsonError(403, "forbidden", "That mini is not yours.");
  if (mini.status !== "ready") return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now.");

  const extraPaths = mini.extra_paths ?? {};
  const figureGlbPath = extraPaths.raw_glb ?? mini.glb_path;
  const figureStlPath = extraPaths.raw_stl ?? mini.stl_path;
  if (!figureGlbPath) return jsonError(409, "invalid_state", "This mini isn't in a state that allows that right now."); // nothing to recompose from

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

    const { error: updateErr } = await admin.from("minis").update({
      base_id: baseId,
      scale_mm: scaleMm,
      glb_path: glbPath,
      stl_path: stlPath,
    }).eq("id", miniId);
    if (updateErr) throw updateErr;
  } catch (e) {
    console.error("forge-mini set_base: composition failed", e);
    return jsonError(502, "compose_failed", "The mini could not be put on that base. Please try again.");
  }

  return json({ mini_id: miniId, base_id: baseId, scale_mm: scaleMm });
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "Send a JSON body with an action.");

  // Deleting generates nothing, so a frozen or child account may still remove
  // its minis, and its campaigns with them. Everything else is blocked for
  // those accounts (the credit gate would not apply to them).
  const deletes = body.action === "delete" || body.action === "delete_campaign";
  if (!deletes) {
    const accountRefusal = await generationRefusal(admin, user.id);
    if (accountRefusal) return accountRefusal;
  }

  // Spending actions are dark unless the feature is "live" — the endpoint, not
  // the client, is the gate (hidden/teaser must not be bypassable for credits).
  const spends = body.action === "stylize" || body.action === "sculpt" || body.action === "resculpt";
  if (spends && !(await isLiveMode())) return jsonError(403, "feature_disabled", "The Simulacrum ritual isn't open yet.");

  // EU AI Act Art 50(1) likeness backstop — stylize sends the source portrait
  // to the provider, sculpt sends the stylized render to Meshy; both are
  // portrait flows per context/compliance/provenance-architecture.md §3.
  // resculpt/cancel/delete/set_base never send a NEW portrait, so they're
  // exempt. Cheap, early, before any credit reservation. Client pre-flights
  // the identical check via useLikenessGate — this rarely actually fires.
  const needsLikenessAck = body.action === "stylize" || body.action === "sculpt";
  if (needsLikenessAck && !(await hasLikenessAcknowledgement(admin, user.id))) {
    return jsonError(403, "likeness_acknowledgement_required", "Confirm the likeness notice first, then try again.");
  }

  switch (body.action) {
    case "stylize":  return handleStylize(user.id, body, report);
    case "sculpt":   return handleSculptAction(user.id, body, true, report);
    case "resculpt": return handleSculptAction(user.id, body, false, report);
    case "cancel":   return handleCancel(user.id, body, report);
    case "delete":   return handleDelete(user.id, body, report);
    case "delete_campaign": return handleDeleteCampaign(user.id, body, report);
    case "set_base": return handleSetBase(user.id, body);
    default:         return jsonError(400, "invalid_action", "Unknown action.");
  }
}));
