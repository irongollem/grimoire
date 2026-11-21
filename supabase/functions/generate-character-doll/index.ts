/**
 * Character paper doll (#975): make a party member's doll FROM its portrait.
 * A doll is three sprite sheets (garb, armour, burden) plus the layout that
 * keeps every outfit in one frame; the shape is `DollSheets` in
 * _shared/paperDoll/types.ts and the result is stored whole on
 * `party_members.doll`.
 *
 * PLATFORM KEYS ONLY, like generate-cutout and Simulacrum: a campaign's own
 * OpenAI key is never read, so every doll is charged. The model is PINNED
 * (DOLL_IMAGE_MODEL), not taken from provider_config: the fidelity spike proved
 * placement and likeness on that one model, and a different default would
 * quietly break the cell grid the whole doll depends on. The three renders are
 * priced as one set: the `character_doll` base (three pictures' worth) times
 * OpenAI's image multiplier times the sheet size's multiplier, like every
 * other OpenAI picture. It was once a flat price with neither multiplier, which
 * ignored the admin's provider rate (20261113223710).
 *
 * Two rounds, not three parallel renders. Round 1 draws the garb sheet from
 * the portrait (the character's own body). Round 2 draws the armour and burden
 * sheets AGAINST that garb sheet, so they show this character rather than the
 * template's; the two round-2 renders are independent and run in parallel.
 *
 * Each set is uploaded to a fresh folder (`<set id>`) instead of overwriting
 * fixed paths: the CDN caches sheets by URL, so reusing a path would keep
 * serving the old set after a re-roll. The previous set's folder is deleted
 * once the new one is stored.
 *
 * Runs as an async image job (`createImageJob` + `EdgeRuntime.waitUntil`):
 * three high-quality renders in two rounds take over a minute, past the
 * gateway timeout.
 * Nothing is written to the member unless every render, the measuring and the
 * uploads succeeded.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import decode from "@jsquash/webp/decode";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { applyMultiplier, fetchProviderConfigs } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob } from "../_shared/imageJob.ts";
import { generateImage, resolveImageProvider, type ImageGenResult } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { settleHandedOff, withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry, publicUrlFor } from "../_shared/storage-upload.ts";
import { deleteByPrefix } from "../_shared/storage-delete.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { registerImageProvenance } from "../_shared/provenance/register.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import {
  DOLL_IMAGE_MODEL,
  DOLL_SHEET_SIZE,
  armourPrompt,
  burdenPrompt,
  characterGarbPrompt,
} from "../_shared/paperDoll/prompts.ts";
import { buildDollLayout, sheetCuts } from "../_shared/paperDoll/layout.ts";
import {
  DOLL_SHEET_KEYS,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  parseDollSheets,
  templateSizeFor,
  type DollSheetKey,
  type DollSheets,
  type DollTemplateSize,
} from "../_shared/paperDoll/types.ts";
import { validateDollRequest } from "./validateDollRequest.ts";
import { UUID_RE } from "../_shared/uuid.ts";

const BUCKET = "npc-portraits";
/** A pending job older than this is treated as dead (the isolate was killed), so it no longer blocks a retry. */
const IN_FLIGHT_WINDOW_MS = 10 * 60 * 1000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface MemberRow {
  id: string;
  user_id: string;
  owner_user_id: string | null;
  is_dm_managed: boolean | null;
  campaign_id: string | null;
  portrait_url: string | null;
  species_id: string | null;
  doll: unknown;
}


/**
 * `party_members.species_id` is text holding either a shared `library_species`
 * slug or a custom `species` uuid (see speciesLookup.ts in the app). Each id
 * must go to the table it lives in: a uuid filter on the text table, or a slug
 * on the uuid column, is an error rather than an empty hit.
 * Returns null for an absent ID, missing row, or null size; database errors propagate.
 */
async function speciesSizeOf(speciesId: string | null): Promise<string | null> {
  if (!speciesId) return null;
  const table = UUID_RE.test(speciesId) ? "species" : "library_species";
  const { data, error } = await admin.from(table).select("size").eq("id", speciesId).maybeSingle();
  if (error) throw error;
  return data ? (data as { size: string | null }).size : null;
}

/** Read a bundled size reference as a WebP blob; file read errors propagate. */
async function readTemplate(size: DollTemplateSize, kind: "garb" | "armour"): Promise<Blob> {
  const bytes = await Deno.readFile(new URL(`./templates/${size}-${kind}.webp`, import.meta.url));
  return new Blob([bytes], { type: "image/webp" });
}

/** Decode generated base64 into a blob with its reported media type; invalid base64 throws. */
function blobOf(result: ImageGenResult): Blob {
  const bin = Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0));
  return new Blob([bin], { type: result.contentType });
}

/**
 * Decode a generated WebP sheet into RGBA and dimensions. Reject dimensions
 * other than 1536x1024; base64 and decoder errors also propagate.
 */
async function decodeSheet(result: ImageGenResult): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bin = Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0));
  const img = await decode(bin.buffer);
  // Layout reads rows at a fixed stride, so a sheet of any other size would be
  // measured wrong and stored anyway. Failing here releases the credits.
  if (img.width !== SHEET_WIDTH || img.height !== SHEET_HEIGHT) {
    throw new Error(`The sheet came back ${img.width}x${img.height}, not ${SHEET_WIDTH}x${SHEET_HEIGHT}.`);
  }
  // A view over the same bytes: decode's declared pixel type is wider than the
  // 8-bit RGBA it actually returns.
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.width * img.height * 4) };
}

/**
 * The storage folder of a previous doll set, derived from its garb sheet's URL;
 * null unless it is this caller's own set for this character. Clients cannot
 * write `doll` (guard_party_member_doll), so the URL is the generator's own;
 * the folder is still pinned to the caller as a second line, so a stored value
 * can never steer this delete into anyone else's files. A set drawn by someone
 * else (the DM, then the player redraws) is left in place rather than deleted.
 */
function previousSetPrefix(doll: unknown, memberId: string, userId: string, newSetId: string): string | null {
  const parsed = parseDollSheets(doll);
  if (!parsed) return null;
  const match = new RegExp(`/([^/]+)/dolls/${memberId}/([0-9a-f-]+)/`).exec(parsed.sheets.garb);
  if (!match || match[1] !== userId || match[2] === newSetId) return null;
  return `${userId}/dolls/${memberId}/${match[2]}`;
}

/**
 * Generate and upload a doll, store it on the member and clear the ask. The held credits are settled by
 * `settleHandedOff`: the charge is queued the moment the doll is stored, so a later failure (the old set's deletion,
 * the job's bookkeeping) can never turn a delivered, paid doll into "failed, not charged". Only a failure before the
 * doll was stored marks the job failed; prior uploads are not rolled back.
 */
async function runDoll(args: {
  jobId: string;
  memberId: string;
  userId: string;
  apiKey: string;
  moderationKey: string | null;
  quality: string | null;
  size: DollTemplateSize;
  portraitUrl: string;
  previousDoll: unknown;
  cost: number;
  reservationIds: string[];
  report: (err: unknown) => void;
}): Promise<void> {
  const { jobId, memberId, userId, apiKey, moderationKey, quality, size, portraitUrl, previousDoll, cost, reservationIds, report } = args;
  const model = DOLL_IMAGE_MODEL;

  const render = (prompt: string, sourceImages: Blob[]) =>
    generateImage({
      provider: "openai", model, apiKey, quality, prompt, size: DOLL_SHEET_SIZE, sourceImages,
      background: "transparent", boostStyle: false,
      screening: { apiKey: moderationKey, admin, userId, generationType: "character_doll" },
    });

  let stored = false;
  let firstSheetUrl = "";
  try {
    await settleHandedOff(admin, { payerId: userId, ids: reservationIds, report }, async (ledger) => {
      const portraitRes = await fetch(portraitUrl);
      if (!portraitRes.ok) throw new Error(`Portrait fetch failed (${portraitRes.status})`);
      const portrait = await portraitRes.blob();
      const [templateGarb, templateArmour] = await Promise.all([readTemplate(size, "garb"), readTemplate(size, "armour")]);

      // A sheet whose figures touch cannot be cut apart, so it is drawn once more
      // (the model keeps its margins nearly always; a second miss is kept, since
      // its cut still falls in the narrowest overlap and the player has paid).
      /** Retry once when figures lack a separating gap; keep the second result even if it overlaps. */
      const renderSheet = async (prompt: string, sources: Blob[]) => {
        const first = await render(prompt, sources);
        const firstRgba = await decodeSheet(first);
        if (sheetCuts(firstRgba.data, firstRgba.width).clean) return { result: first, rgba: firstRgba };
        const second = await render(prompt, sources);
        return { result: second, rgba: await decodeSheet(second) };
      };

      // Round 1: the character's own body.
      const garb = await renderSheet(characterGarbPrompt(), [portrait, templateGarb]);
      const garbBlob = blobOf(garb.result);

      // Round 2: the same character in armour and under load.
      const [armour, burden] = await Promise.all([
        renderSheet(armourPrompt({ withTemplate: true }), [garbBlob, templateArmour]),
        renderSheet(burdenPrompt(), [garbBlob]),
      ]);
      const layout = buildDollLayout(garb.rgba.data, armour.rgba.data, burden.rgba.data, SHEET_WIDTH);

      const results: Record<DollSheetKey, ImageGenResult> = { garb: garb.result, armour: armour.result, burden: burden.result };
      const setId = crypto.randomUUID();
      const generatedAt = new Date().toISOString();
      const urls = {} as Record<DollSheetKey, string>;
      for (const key of DOLL_SHEET_KEYS) {
        const result = results[key];
        const path = `${userId}/dolls/${memberId}/${setId}/${key}.webp`;
        // EU AI Act Art 50(2): mark before upload, as forge-mini does.
        const prov: AiProvenance = {
          generatorType: "character_doll", provider: result.usage.provider, model, generatedAt, edited: false,
        };
        const bin = Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0));
        await uploadWithRetry(admin, BUCKET, path, markGeneratedImage(bin, result.contentType, prov), "image/webp");
        // Bytes are stored and the mark inside the file is the disclosure of
        // record, so a registry failure must not waste the paid set.
        try {
          await registerImageProvenance(admin, BUCKET, path, userId, prov);
        } catch (err) {
          console.error(`image_provenance registration failed for ${BUCKET}/${path}`, err);
        }
        urls[key] = publicUrlFor(admin, BUCKET, path);
      }

      const doll: DollSheets = { version: 1, sheets: urls, layout, model, generatedAt };
      const { data: written, error: writeErr } = await admin
        .from("party_members")
        // A finished doll answers any open ask for one.
        .update({ doll, doll_requested_at: null })
        .eq("id", memberId)
        .select("id")
        .maybeSingle();
      if (writeErr || !written) throw new Error(`Could not store the doll: ${writeErr?.message ?? "character not found"}`);

      stored = true;
      firstSheetUrl = urls.garb;
      const sum = (pick: (r: ImageGenResult) => number | undefined) =>
        Object.values(results).reduce((total, r) => total + (pick(r) || 0), 0);
      ledger.charge("character_doll", {
        cost, isByok: false,
        log: {
          model, quality, size: DOLL_SHEET_SIZE, provider: "openai", image_count: 3,
          input_tokens: sum((r) => r.usage.input_tokens) || undefined,
          input_image_tokens: sum((r) => r.usage.input_image_tokens) || undefined,
          output_tokens: sum((r) => r.usage.output_tokens) || undefined,
        },
    });

    const oldPrefix = previousSetPrefix(previousDoll, memberId, userId, setId);
    if (oldPrefix) {
      try {
        await deleteByPrefix(admin, BUCKET, oldPrefix);
      } catch (err) {
        console.error(`generate-character-doll: could not delete previous set ${oldPrefix}`, err);
      }
    }
    });
  } catch (e) {
    if (stored) {
      // The doll is on the member and charged: whatever threw afterwards must not call the job failed.
      console.error("generate-character-doll: settling after a stored doll failed", e);
      report(e);
    } else {
      // A refusal is the player's to reword (or to choose another portrait), not an outage.
      const message = isPromptRejected(e)
        ? `The image was refused by content screening: ${e.message}`
        : e instanceof Error ? e.message : "Doll generation failed";
      if (!isPromptRejected(e)) console.error("generate-character-doll failed:", e);
      try {
        await failImageJob(admin, jobId, message);
      } catch (failErr) {
        console.error("generate-character-doll: could not mark the job failed", failErr);
        report(failErr);
      }
      return;
    }
  }

  // Job bookkeeping sits outside the settlement: a doll that was stored and charged is never "failed".
  try {
    await completeImageJob(admin, jobId, firstSheetUrl);
  } catch (e) {
    console.error("generate-character-doll: completeImageJob failed after the doll was stored", e);
    report(e);
  }
}

serve(serveUser(async ({ user, req, userClient: supabase, report }) => {
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const validation = validateDollRequest(body);
  if (!validation.ok) return jsonError(400, validation.error, "Send the character to draw a doll for.");
  const memberId = validation.request.party_member_id;

  // RLS-scoped read of the member: RLS decides whether the caller may see the row at all; the ownership check below
  // is the extra bar a readable row must clear before it may spend credits.
  const { data: memberRaw, error: memberErr } = await supabase
    .from("party_members")
    .select("id, user_id, owner_user_id, is_dm_managed, campaign_id, portrait_url, species_id, doll")
    .eq("id", memberId)
    .maybeSingle();
  if (memberErr) {
    console.error("generate-character-doll: member read failed", memberErr);
    return jsonError(500, "member_read_failed", "The character could not be read. Please try again.");
  }
  if (!memberRaw) return jsonError(404, "not_found", "This character could not be found.");
  const member = memberRaw as MemberRow;

  if (!member.campaign_id) return jsonError(400, "no_campaign", "Open a campaign first.");

  // The owner makes their own character's doll; the DM may make one for any
  // character at their table, which is how a player without credits gets one
  // (they ask, the DM grants: party_members.doll_requested_at). Whoever calls
  // pays, so a DM-made doll is always charged to the DM.
  const load = await loadAiCampaign<BaseCampaign>(admin, member.campaign_id, user.id, {
    access: async (a, c, uid) => member.owner_user_id === uid || await isCampaignDm(a, c, uid),
    forbiddenMessage: "Only the character's player or the campaign's DM can make its doll.",
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  if (!member.portrait_url) return jsonError(400, "no_portrait", "Add a portrait first: the doll is drawn from it.");
  if (!isSafeStorageUrl(member.portrait_url)) {
    console.warn("generate-character-doll: rejected unsafe portrait_url — refusing rather than proceeding without a reference");
    return jsonError(400, "no_portrait", "Add a portrait first: the doll is drawn from it.");
  }

  // EU AI Act Art 50(1) likeness backstop: the portrait goes to the provider.
  // Before any credit or provider work.
  if (!(await hasLikenessAcknowledgement(admin, user.id))) {
    return jsonError(403, "likeness_acknowledgement_required", "Confirm the likeness notice first, then try again.");
  }

  // One doll per character at a time. A pending job older than the window is
  // a killed isolate, not a render still running.
  const since = new Date(Date.now() - IN_FLIGHT_WINDOW_MS).toISOString();
  const { data: inFlight, error: inFlightErr } = await admin
    .from("image_generation_jobs")
    .select("id")
    .eq("kind", "character_doll")
    .eq("target_id", member.id)
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(1);
  if (inFlightErr) {
    console.error("generate-character-doll: in-flight check failed", inFlightErr);
    return jsonError(500, "job_create_failed", "The doll could not be started. Please try again.");
  }
  if (inFlight && inFlight.length > 0) return jsonError(409, "doll_in_progress", "Your doll is already being drawn.");

  let speciesSize: string | null;
  try {
    speciesSize = await speciesSizeOf(member.species_id);
  } catch (e) {
    console.error("generate-character-doll: species lookup failed", e);
    return jsonError(500, "species_read_failed", "The character's species could not be read. Please try again.");
  }
  const size = templateSizeFor(speciesSize);

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    campaignKeys: {}, // deliberately empty — no BYOK path for dolls, see file doc
    pinned: true, // the sheet needs OpenAI's edit endpoint: a capability, not the campaign's Quick/Detailed choice
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
  });
  if (!img) return jsonError(422, "no_image_provider", "Image generation is not available right now.");

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Priced like every OpenAI picture: base × the provider's image multiplier ×
  // the sheet size's multiplier. Mirrored by useCharacterDollCost in the app.
  // Everything that can throw is read before the hold is taken.
  const baseCost = await fetchCreditCost(admin, "character_doll");
  const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(DOLL_SHEET_SIZE));
  const quality = await resolveImageQuality(admin, "character_doll", img);

  return withCreditHold(admin, { payerId: user.id, reason: "character_doll", cost, report }, async (hold) => {
    let jobId: string;
    try {
      jobId = await createImageJob(admin, {
        user_id: user.id,
        campaign_id: campaign.id,
        kind: "character_doll",
        prompt: characterGarbPrompt().slice(0, 500),
        size: DOLL_SHEET_SIZE,
        model: DOLL_IMAGE_MODEL,
        provider: "openai",
        // target_id identifies the character for the one-pending-doll index; no
        // target_table/column, so completing the job writes nothing to a row.
        target_id: member.id,
      });
    } catch (e) {
      // Another request for this character got its job in first: the in-flight
      // check above is a courtesy, the unique index is the guarantee.
      if (e instanceof Error && e.message.includes("image_generation_jobs_one_pending_doll")) {
        return jsonError(409, "doll_in_progress", "Your doll is already being drawn.");
      }
      console.error("generate-character-doll: createImageJob failed", e);
      return jsonError(500, "job_create_failed", "The doll could not be started. Please try again.");
    }

    // The job owns the hold from here: the worker settles it.
    const reservationIds = hold.handOff();
    const run = runDoll({
      jobId,
      memberId: member.id,
      userId: user.id,
      apiKey: img.apiKey,
      moderationKey: img.moderationKey,
      quality,
      size,
      portraitUrl: member.portrait_url!,
      previousDoll: member.doll,
      cost,
      reservationIds,
      report,
    });
    try {
      // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
      EdgeRuntime.waitUntil(run);
    } catch (e) {
      // The worker is already running; only the keep-alive failed.
      console.error("generate-character-doll: waitUntil failed", e);
      report(e);
    }
    return json({ job_id: jobId });
  });
}));
