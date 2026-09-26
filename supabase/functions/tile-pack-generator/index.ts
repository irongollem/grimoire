import { serve } from "std/http/server.ts";
import { createClient, type User } from "@supabase/supabase-js";
import { createDraftManifest, createGenerationPlan, enumerateSchemaSlots, rotationFor, slotId, slotRelativePath, type GenerationAttempt, type GenerationJob, type GenerationPlan, type ImageGenerationQuality, type PackArtBible } from "../../../src/cartographer/authoringPlan.ts";
import { validatePack } from "../../../src/cartographer/validatePack.ts";
import { coverageCounts, hasCompleteArt, undrawnSlotIds } from "../../../src/cartographer/packCoverage.ts";
import type { TilePackManifest } from "../../../src/cartographer/packSchema.ts";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { generateImage } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import { buildTileProvenance } from "./tileProvenance.ts";
import { libraryPackTarget, mintLibraryPackId, packPrefix, userPackTarget, type PackTarget } from "./packTarget.ts";
import { PROOF_SLOT_IDENTITIES, PROOF_SLOTS, baseReferenceCandidates, initialGenerationStatus, parseTileSlot, validateLibraryPackPatch } from "./libraryActions.ts";
import { fetchCreditCost, recordFreeGeneration, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { tilePackSlug, webpDimensions } from "../_shared/tilePackGeneration.ts";
import { attemptCharge, attemptsRemaining, canAttempt } from "../../../src/cartographer/generationBudget.ts";
import { chunk, listAllFilePaths, type StorageEntry } from "../_shared/storage-purge.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";

/**
 * Fallback only. The active model comes from `provider_config.image_model`,
 * the same row every other image feature resolves through
 * (`resolveImageProvider` in _shared/imageGen.ts) — this function used to
 * hardcode the id and so kept rendering on `gpt-image-2` long after the
 * platform moved to `gpt-image-2.5-flare`, which is faster, better and
 * cheaper. It was the only image path not reading the config, and nothing
 * surfaced it because a stale-but-valid model id renders perfectly well.
 */
const FALLBACK_MODEL = "gpt-image-2";

const MAX_NORMALIZED_B64 = 512_000;

/** Narrows resolveImageQuality's `string | null` to the attempt log's own
 *  literal union — this path is openai-only, so the resolved value is always
 *  one of OpenAI's four `quality` values (or null, the provider default). */
function isImageGenerationQuality(value: string | null): value is ImageGenerationQuality {
  return value === "low" || value === "medium" || value === "high" || value === "auto";
}

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
 * Mirrors `createRun` above for the library lane: no campaign of any kind —
 * the caller must simply be an admin — and the new pack row lands in
 * `library_tile_packs` rather than `user_tile_packs`. Same
 * rollback-on-failure sequence.
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
 * Publishing checks two different things, and both are kept because they
 * answer different questions:
 *
 *  - `validatePack` is declaration-based — does the manifest describe a
 *    well-formed pack (no extra/unknown slots, no bad shapes)? Its `extras`
 *    and `warnings` are still worth surfacing to the admin.
 *  - `hasCompleteArt` (from `packCoverage.ts`) is byte-based — does every
 *    required slot actually carry drawn bytes? `validatePack` cannot see
 *    this: it reports a slot present once the manifest declares it with a
 *    URL, which is exactly the shape of the ten packs #889 S7 migrated with
 *    a full slot list and zero images behind any of it. `validatePack(...).valid`
 *    was `true` for every one of them, which is how all twelve library packs
 *    ended up published while ten held no art at all. The publish gate is
 *    therefore `hasCompleteArt`, not `validatePack(...).valid` — a manifest
 *    can be well-formed and still have nothing drawn.
 *
 * Un-publishing (`archived`) needs no validation — retiring a pack is always
 * safe, and must stay possible even for a pack that never finished.
 */
async function setLibraryPackStatus(user: User, body: Record<string, unknown>, publish: boolean): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("id, manifest").eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);
  if (publish) {
    const manifest = pack.manifest as TilePackManifest;
    // Structural findings only — `validation.valid` is deliberately not the
    // gate, but the findings themselves still travel with a refusal. Its
    // warnings (a duplicate slot, a non-WebP url, a schema newer than this
    // build) are the likeliest explanation for why a slot the admin believes
    // they filled is not being counted, and they are invisible anywhere else.
    const validation = validatePack(manifest);
    if (!hasCompleteArt(manifest)) {
      const { required, requiredDrawn } = coverageCounts(manifest);
      return json({ error: "pack_incomplete", required, requiredDrawn, validation }, 409);
    }
    const { error } = await admin.from("library_tile_packs").update({ status: "published" }).eq("id", pack.id);
    if (error) return json({ error: error.message }, 500);
    return json({ status: "published" });
  }
  const { error } = await admin.from("library_tile_packs").update({ status: "archived" }).eq("id", pack.id);
  if (error) return json({ error: error.message }, 500);
  return json({ status: "archived" });
}

/**
 * Partial update of a library pack's admin-editable metadata. Validates only
 * the fields actually present (`validateLibraryPackPatch`), then checks
 * `content_source_key` against the `content_sources` catalogue here — the one
 * piece of that validation that needs the database.
 *
 * When `name` or `description` changes, the manifest's own copies are patched
 * in the same update. `manifest.name`/`manifest.description` are not mirrors
 * kept for display: `createGenerationPlan` reads them straight into
 * `pack_local_theme` (via `artBible`) to brief every future generation run.
 * Leaving them stale after a rename means the next run for this pack is
 * briefed from text the admin already changed.
 */
async function updateLibraryPack(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("*").eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);

  const validation = validateLibraryPackPatch(body);
  if (!validation.ok) return json({ error: validation.error }, 400);
  const { patch } = validation;

  if (patch.content_source_key) {
    const { data: source } = await admin.from("content_sources").select("key").eq("key", patch.content_source_key).maybeSingle();
    if (!source) return json({ error: "invalid_content_source" }, 400);
  }

  const update: Record<string, unknown> = { ...patch };
  if (patch.name !== undefined || patch.description !== undefined) {
    const manifest = structuredClone(pack.manifest as TilePackManifest);
    if (patch.name !== undefined) manifest.name = patch.name;
    if (patch.description !== undefined) manifest.description = patch.description;
    update.manifest = manifest;
  }

  const { data: updated, error } = await admin.from("library_tile_packs").update(update).eq("id", pack.id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ pack: updated });
}

/**
 * Uploads one human-drawn tile directly onto a library pack, bypassing
 * generation entirely. Mirrors `completeSlot`'s manifest patch
 * (`index.ts:659-670` at the time this was written) exactly, minus the
 * generation-run bookkeeping that action owns — there is no job, no run, no
 * attempt history, because nothing was generated.
 */
async function uploadLibraryTile(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("*").eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);

  // Absent and oversized are different failures and must not share an error:
  // "that image is too large" is actively misleading for a request that
  // carried no image at all, and it is the only feedback the admin gets.
  const imageB64 = typeof body.image_b64 === "string" ? body.image_b64 : "";
  if (!imageB64) return json({ error: "invalid_image" }, 400);
  if (imageB64.length > MAX_NORMALIZED_B64) return json({ error: "image_too_large" }, 400);

  const knownSlotIds = new Set(enumerateSchemaSlots(true).map(slotId));
  const parsed = parseTileSlot(body.slot, knownSlotIds);
  if (!parsed.ok) return json({ error: "invalid_slot" }, 400);
  const slot = parsed.slot;

  const bytes = decodeBase64(imageB64);
  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width !== 128 || dimensions.height !== 128) {
    return json({ error: "invalid_image" }, 400);
  }

  const target = libraryPackTarget(pack);
  const relative = slotRelativePath(slot);
  const { error: uploadError } = await admin.storage.from(target.bucket).upload(`${target.prefix}/${relative}`, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const manifest = structuredClone(pack.manifest as TilePackManifest);
  const slots = [...(manifest.assets[slot.category] ?? [])].filter((existing) =>
    existing.variant !== slot.variant || existing.side !== slot.side
  );
  slots.push({
    ...(slot.side ? { side: slot.side } : {}),
    variant: slot.variant,
    url: relative,
    byteSize: bytes.byteLength,
    rev: Date.now(),
  });
  manifest.assets[slot.category] = slots;
  // Deliberately no `ai_provenance` write here — see #900 decision 4.
  // `completeSlot` sets it on every normalize because that path only ever
  // handles model output; this action's bytes are human-drawn, so there is no
  // generation to attest to. Writing a provenance record for a human upload
  // would be a false AI-provenance claim, not a completeness fix.
  const { error } = await admin.from("library_tile_packs").update({ manifest }).eq("id", pack.id);
  if (error) return json({ error: error.message }, 500);
  return json({ slot_id: slotId(slot), relative_path: relative, byte_size: bytes.byteLength });
}

/**
 * Starts a generation run against an existing library pack for a chosen
 * subset of its slots (or every undrawn one). This is `createLibraryRun`'s
 * sibling for a pack that already exists — it never creates a
 * `library_tile_packs` row, so its failure path only ever has a run and jobs
 * to roll back, never the pack. Getting that backwards would delete a
 * published pack on an insert failure.
 */
async function generateLibraryPack(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!isAppAdmin(user)) return json({ error: "admin_required" }, 403);
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  const { data: pack } = await admin.from("library_tile_packs").select("*").eq("id", packId).maybeSingle();
  if (!pack) return json({ error: "pack_not_found" }, 404);

  const { count: activeRuns } = await admin.from("tile_pack_generation_runs")
    .select("id", { count: "exact", head: true }).eq("library_tile_pack_id", pack.id)
    .in("status", ["proof_pending", "awaiting_approval", "generating", "cancelling"]);
  if ((activeRuns ?? 0) > 0) return json({ error: "generation_already_running" }, 409);

  const manifest = pack.manifest as TilePackManifest;
  const requestedIds = Array.isArray(body.slot_ids) && body.slot_ids.length > 0
    ? body.slot_ids as unknown[]
    : undrawnSlotIds(manifest);
  if (requestedIds.length === 0) return json({ error: "nothing_to_generate" }, 400);

  const knownSlots = new Map(enumerateSchemaSlots(true).map((slot) => [slotId(slot), slot]));
  const selection: string[] = [];
  for (const rawId of requestedIds) {
    if (typeof rawId !== "string" || !knownSlots.has(rawId)) {
      return json({ error: "unknown_slot_id", slot_id: rawId }, 400);
    }
    selection.push(rawId);
  }

  // createGenerationPlan throws `Unknown schema slot: <id>` on an id it
  // cannot resolve — every id in `selection` was just checked against the
  // same schema slot set above, so this cannot throw here.
  const plan = createGenerationPlan({
    manifest,
    artBible: artBible(pack.name, pack.description),
    selectedSlotIds: selection,
  });

  const status = initialGenerationStatus(plan.jobs);

  const { data: run, error: runError } = await admin.from("tile_pack_generation_runs").insert({
    user_id: user.id,
    library_tile_pack_id: pack.id,
    status,
    plan,
    total_jobs: plan.jobs.length,
  }).select().single();
  if (runError || !run) return json({ error: runError?.message ?? "run_create_failed" }, 500);

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
    // Roll back the run and its jobs only — this action did not create the
    // pack, so the pack is never part of this rollback. See the docstring
    // above: getting this backwards destroys a published pack.
    await admin.from("tile_pack_generation_runs").delete().eq("id", run.id);
    return json({ error: jobsError.message }, 500);
  }
  return json({ run_id: run.id, total_jobs: plan.jobs.length, status }, 201);
}

async function registerUpload(userId: string, body: Record<string, unknown>): Promise<Response> {
  // Uploading your own pack is a Pro feature in its own right, not AI:
  // generating a pack is open to every plan with credits, uploading one is not
  // (the same split as the soundboard's own-audio upload).
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
 *
 * `generate_library_pack` (#900 S2) can start a run whose plan skips the
 * proof phase entirely — filling gaps in a pack that already has its
 * floor/wall/solidBlock tiles (see `initialGenerationStatus`) — so this run's
 * own proof-job query above can come back empty even though the pack it is
 * joining has plenty of art to match. Falling back to that pack's own
 * existing tiles (in `PROOF_SLOT_IDENTITIES` order, skipping any that fail to
 * download) is not just the fix for that empty-reference case: a run
 * extending an existing pack should be briefed by that pack's own tiles
 * regardless, so a new "generating" doorway matches the floor already drawn
 * for it rather than whatever a fresh proof pass happened to produce.
 */
/**
 * The neutral base tile for a slot, or null where the set deliberately has none.
 *
 * Always read from the `library-tile-packs` bucket regardless of lane: the set
 * is shared platform content, so a DM's private pack is briefed from the
 * same geometry a library pack is. That is the point — the user lane needs this
 * more than we do, being capped at four attempts with no way to hand-repair a
 * tile.
 */
async function baseReference(slot: GenerationJob["slot"]): Promise<Blob | null> {
  for (const candidate of baseReferenceCandidates(slot)) {
    const { data } = await admin.storage.from("library-tile-packs").download(candidate);
    if (data) return data;
  }
  return null;
}

/**
 * Every image the renderer is given for one slot: geometry first, then style.
 *
 * The ordering is the message. The base tile says what SHAPE this is — where
 * the wall band sits, how thick it is, that a door has a hinged leaf rather
 * than being a hole — and the style references say what it is MADE OF. Measured
 * 21 Sep 2026, geometry is the half that collapses without a reference: under a
 * material with no internal contrast a door leaf restyles into more wall, while
 * a reference carrying hinge, handle and seam survives.
 *
 * Capped at three. Each reference is ~1148 input image tokens, so the cap is
 * what keeps a 57-tile pack's reference cost near half a dollar rather than
 * unbounded.
 *
 * The proof phase gets references now, where before it got none at all
 * (`allowedPhase === "pack" ? ... : []`). Its three tiles anchor every other
 * tile in the pack, so they were the slots generated with least to go on and
 * the ones whose errors propagated furthest.
 */
async function slotReferences(runId: string, target: PackTarget, slot: GenerationJob["slot"], phase: "proof" | "pack"): Promise<Blob[]> {
  const base = await baseReference(slot);
  const references = base ? [base] : [];
  if (phase === "proof") return references;
  const style = await styleReferences(runId, target, slot.category);
  return [...references, ...style].slice(0, 3);
}

async function styleReferences(runId: string, target: PackTarget, category?: string): Promise<Blob[]> {
  const { data } = await admin.from("tile_pack_generation_jobs").select("slot_id, style_ref_path, raw_path")
    .eq("run_id", runId).eq("phase", "proof").eq("status", "normalized")
    .not("raw_path", "is", null).order("ordinal").limit(3);
  // A tile's OWN category leads, and this is not a nicety. The caller keeps
  // only the first two of these after the geometry reference, and the proof
  // slots order floor:0, wallSegmentH:0, solidBlock:0 by ordinal — so a
  // `solidBlock:1` render used to be handed the floor it must look UNLIKE and
  // have `solidBlock:0`, the approved block it must match, dropped off the
  // end. The blocks duly came back looking like the floor.
  const rows = [...(data ?? [])].sort((a, b) => {
    const rank = (row: { slot_id: string }) => (category && row.slot_id.split(":")[0] === category ? 0 : 1);
    return rank(a as { slot_id: string }) - rank(b as { slot_id: string });
  });
  const blobs: Blob[] = [];
  for (const row of rows) {
    const path = (row.style_ref_path as string | null) ?? (row.raw_path as string);
    const { data: file } = await admin.storage.from(target.bucket).download(path);
    if (file) blobs.push(file);
  }
  if (blobs.length > 0) return blobs;

  for (const slot of PROOF_SLOT_IDENTITIES) {
    if (blobs.length >= 3) break;
    const { data: file } = await admin.storage.from(target.bucket).download(`${target.prefix}/${slotRelativePath(slot)}`);
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
  // the run (and its target) is resolved above.
  let campaign: Awaited<ReturnType<typeof campaignForGeneration>> = null;
  if (run.lane === "user") {
    // tile_pack_generation_runs_campaign_matches_lane guarantees campaign_id
    // is set whenever tile_pack_id (user lane) is. campaignForGeneration is
    // the ai_enabled gate for this lane — every plan may generate once it's
    // on, same as every other generator.
    campaign = await campaignForGeneration(run.campaign_id!, userId);
    if (!campaign) return json({ error: "campaign_forbidden" }, 403);
  }
  // Library lane: the admin claim was already verified inside
  // requireGenerationRun. There is no campaign and no per-user plan to check
  // for platform-authored content.
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
    const references = await slotReferences(runId, run.target, job.slot, allowedPhase);
    const providerConfigs = await fetchProviderConfigs(admin, ["openai"]);
    const model = providerConfigs.openai?.image_model ?? FALLBACK_MODEL;
    // A tile's whole economy rests on its quality: "low" is ~196 output tokens
    // against thousands for "high", and the 12-credit price covers four
    // attempts on that basis. The migration that added image_quality_tier
    // (20260926104103) sets this row to "low" for exactly that reason, so an
    // admin raising image quality elsewhere cannot silently multiply the cost
    // of a 57-tile pack — reaching "high" here now takes an explicit,
    // visible change in Admin -> Pricing rather than a shared provider knob.
    const quality = await resolveImageQuality(admin, "tile_pack_generation", {
      base: "openai",
      imageQuality: providerConfigs.openai?.image_quality ?? null,
    });
    const result = await generateImage({
      provider: "openai",
      model,
      apiKey,
      // Same key: this path is openai-only, so the renderer's key screens too.
      screening: { apiKey, admin, userId, generationType: "tile_pack" },
      prompt: job.prompt.final_prompt,
      size: job.execution.requested_size,
      quality,
      sourceImages: references,
      background: job.mechanics.alpha === "transparent-outside-footprint" ? "transparent" : "opaque",
    });
    const attemptNumber = ((claimed.attempts as unknown[] | null)?.length ?? 0) + 1;
    // Scoped by RUN, not just by slot and attempt. `attemptNumber` counts
    // attempts within one job row and so restarts at 1 for every new run, while
    // the path was keyed only on slot and attempt — so a second run touching a
    // slot some earlier run had already drawn tried to write a path that
    // existed, and the upload's `upsert: false` failed it with "The resource
    // already exists". The slot's whole generation then failed for a reason
    // that had nothing to do with the image.
    //
    // Latent until #900: before it, a pack got exactly one run, created with
    // the pack itself. `generate_library_pack` makes re-running a slot the
    // normal case — filling gaps and redrawing a tile you dislike are the two
    // things it exists for — so every regeneration would have hit this.
    //
    // Keyed rather than upserted so an earlier run's raw survives as evidence:
    // `styleReferences` reads whatever `raw_path` the job recorded, and
    // deleting a pack still sweeps the entire prefix.
    const rawPath = `${run.target.prefix}/raw/${runId}/${job.id.replaceAll(":", "-")}-${attemptNumber}.webp`;
    // Marked here, once, right where the bytes come back from the provider —
    // every downstream consumer (the raw upload below, and the b64 handed
    // back to the client for normalization) shares this one marked copy.
    // `result.contentType` is the provider-reported format, not an assumed
    // webp (imageGen.ts's ImageGenResult docstring) — required so the XMP
    // embedder picks the matching binary format rather than silently no-op'ing.
    const prov = buildTileProvenance(result.usage.provider, model);
    const markedB64 = markGeneratedImageB64(result.b64, result.contentType, prov);
    const rawBytes = decodeBase64(markedB64);
    const { error: uploadError } = await admin.storage.from(run.target.bucket).upload(rawPath, rawBytes, {
      contentType: result.contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    await releaseCredits(admin, reservation.ids);
    const usage = {
      model,
      quality,
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
        model,
        quality: isImageGenerationQuality(quality) ? quality : undefined,
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

/**
 * Writes a slot that is a ROTATION of one this run generated.
 *
 * A vertical wall is the horizontal wall turned ninety degrees, so it is
 * produced rather than rendered — no provider call, no ledger row, no credit,
 * and no chance of the two drifting apart the way `celestial-observatory`'s
 * did (22px horizontal against 14px vertical, hand-authored).
 *
 * The client does the turning, because rotation needs a canvas and the edge
 * runtime has no image library. What is checked HERE is the part a client must
 * not be trusted with: that `slot_id` really is a declared rotation of the
 * source job's slot. Without that a caller could hand any bytes to any slot
 * under cover of a legitimate run.
 */
async function completeRotation(user: User, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  const sourceJobId = typeof body.job_id === "string" ? body.job_id : "";
  const derivedId = typeof body.slot_id === "string" ? body.slot_id : "";
  const imageB64 = typeof body.image_b64 === "string" ? body.image_b64 : "";
  const run = await requireGenerationRun(runId, user);
  if (!run) return json({ error: "run_not_found" }, 404);
  if (!imageB64) return json({ error: "invalid_image" }, 400);
  if (imageB64.length > MAX_NORMALIZED_B64) return json({ error: "image_too_large" }, 400);

  const { data: row } = await admin.from("tile_pack_generation_jobs").select("job")
    .eq("id", sourceJobId).eq("run_id", runId).eq("status", "normalized").maybeSingle();
  if (!row) return json({ error: "source_not_normalized" }, 409);
  const source = row.job as GenerationJob;

  const rotation = rotationFor(derivedId);
  if (!rotation || rotation.from !== source.id) return json({ error: "not_a_rotation_of_source" }, 400);
  const slot = enumerateSchemaSlots(true).find((candidate) => slotId(candidate) === derivedId);
  if (!slot) return json({ error: "invalid_slot" }, 400);

  const bytes = decodeBase64(imageB64);
  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width !== 128 || dimensions.height !== 128) {
    return json({ error: "invalid_image" }, 400);
  }

  const relative = slotRelativePath(slot);
  const { error: uploadError } = await admin.storage.from(run.target.bucket)
    .upload(`${run.target.prefix}/${relative}`, bytes, { contentType: "image/webp", upsert: true });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const manifest = structuredClone(run.target.manifest);
  const slots = [...(manifest.assets[slot.category] ?? [])].filter((existing) =>
    existing.variant !== slot.variant || existing.side !== slot.side
  );
  slots.push({
    ...(slot.side ? { side: slot.side } : {}),
    variant: slot.variant,
    url: relative,
    byteSize: bytes.byteLength,
    rev: Date.now(),
  });
  manifest.assets[slot.category] = slots;
  // `ai_provenance` is not touched: it is already on the row from the source
  // tile, which is what was generated. A rotation adds no new model output to
  // attest to, and re-stamping it would claim a render that never happened.
  const { error } = await admin.from(run.target.table).update({ manifest }).eq("id", run.target.rowId);
  if (error) return json({ error: error.message }, 500);
  return json({ slot_id: derivedId, relative_path: relative, byte_size: bytes.byteLength });
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
    // Stamped on every write, not only a replacement: the writer cannot know
    // whether anyone has already cached this path, and the whole point of the
    // field is that the reader needs no such knowledge either. See `AssetSlot`.
    rev: Date.now(),
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
    case "update_library_pack": return updateLibraryPack(user, body);
    case "upload_library_tile": return uploadLibraryTile(user, body);
    case "generate_library_pack": return generateLibraryPack(user, body);
    case "generate": return generateSlot(user, body);
    case "complete": return completeSlot(user, body);
    case "complete_rotation": return completeRotation(user, body);
    case "approve_proof":
    case "cancel":
    case "retry_job": return updateRun(user, body);
    case "regenerate_job": return updateRun(user, body);
    default: return json({ error: "unknown_action" }, 400);
  }
}));
