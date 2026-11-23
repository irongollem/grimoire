import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { applyMultiplier, fetchProviderConfigs } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { INJECTION_GUARD_SUFFIX } from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider } from "../_shared/textGen.ts";
import { callDocument, type DocumentPart, UnsupportedDocumentProviderError } from "../_shared/documentGen.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { type BaseCampaign, loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import {
  acceptedImageType,
  LOOK_SCHEMA,
  lookInstruction,
  MAX_LOOK_IMAGE_BYTES,
  preflight,
  shapeOutcome,
} from "./lookRequest.ts";

/**
 * "Describe the look from pictures" (#1252): the DM shows up to four pictures and the model writes the campaign's Look
 * from them. NOTHING IS WRITTEN HERE: the reply is one paragraph the client puts in the Look field for the DM to edit.
 *
 * DM-only, server path (the model reads the pictures through the SSRF guard, which the browser cannot stand in for).
 * The system prompt is the `canon_look` row; the output shape is code.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LEDGER_REASON = "canon_look_description";
const PROMPT_ROW = "canon_look";
// The paragraph is short, but a reasoning model spends this budget on thinking first.
const MAX_TOKENS = 4000;

interface LookCampaign extends BaseCampaign {
  text_provider: string | null;
}

// btoa on a chunked binary string, never on the whole buffer at once: spreading a large array overflows the stack.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Fetches one already-guarded URL. Redirects are refused: a storage URL that redirects is not one of ours. */
async function fetchPart(url: string): Promise<DocumentPart | null> {
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) return null;
  const mimeType = acceptedImageType(res.headers.get("content-type"));
  if (!mimeType) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_LOOK_IMAGE_BYTES) return null;
  return { mimeType, data: toBase64(bytes) };
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate, including BYOK (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  // Body, every URL, and the likeness notice: all before a campaign is read or a credit reserved.
  const checked = await preflight(await readJsonBody(req), {
    isSafeUrl: isSafeStorageUrl,
    likenessAcknowledged: () => hasLikenessAcknowledgement(admin, user.id),
  });
  if (!checked.ok) return jsonError(checked.refusal.status, checked.refusal.code, checked.refusal.message);
  const { campaignId, images, currentLook } = checked.request;

  // DMs only: it spends the campaign's credits or the owner's own provider key.
  const load = await loadAiCampaign<LookCampaign>(admin, campaignId, user.id, { columns: ["text_provider"] });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const { data: promptRow, error: promptError } = await admin
    .from("ai_system_prompts").select("content").eq("generator_type", PROMPT_ROW).maybeSingle();
  if (promptError) throw promptError;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);
  const { provider, apiKey } = text;
  const documentModel = text.config?.document_model ?? null;
  if (!documentModel) return jsonError(422, "provider_unsupported", "Reading pictures isn't available right now.");

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(applyMultiplier(baseCost, text.textMultiplier));

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Fetched before the hold: a picture that cannot be read costs the DM nothing and is named, not skipped.
  const parts: DocumentPart[] = [];
  for (const [index, url] of images.entries()) {
    let part: DocumentPart | null;
    try {
      part = await fetchPart(url);
    } catch (e) {
      console.error("describe-look image fetch failed:", e);
      part = null;
    }
    if (!part) {
      return jsonError(400, "unreadable_image", `Picture ${index + 1} could not be read. Use a PNG, JPEG or WebP under 8 MB.`);
    }
    parts.push(part);
  }

  return withCreditHold(admin, { payerId: user.id, reason: LEDGER_REASON, cost, report }, async (hold) => {
    let outcome: Awaited<ReturnType<typeof callDocument>>;
    try {
      outcome = await callDocument({
        provider,
        apiKey,
        model: documentModel,
        system: promptRow.content + INJECTION_GUARD_SUFFIX,
        instruction: lookInstruction(parts.length, currentLook),
        parts,
        schema: LOOK_SCHEMA,
        maxTokens: MAX_TOKENS,
      });
    } catch (e) {
      console.error("Look description failed:", e);
      if (e instanceof UnsupportedDocumentProviderError) {
        return jsonError(422, "provider_unsupported", `${provider} cannot read pictures here.`);
      }
      return jsonError(502, "generation_failed", "Could not read the pictures. Nothing was charged; please try again.");
    }

    const shaped = shapeOutcome(outcome);
    if (shaped.kind === "failed") return jsonError(shaped.refusal.status, shaped.refusal.code, shaped.refusal.message);

    // Real spend from here on. Token counts may be null (unknown, not zero): recorded as absent.
    const { usage } = shaped;
    hold.charge(LEDGER_REASON, {
      cost,
      isByok: text.isByok,
      log: {
        model: usage.model,
        provider: usage.provider,
        input_tokens: usage.input_tokens ?? undefined,
        output_tokens: usage.output_tokens ?? undefined,
      },
    });
    return json({ look: shaped.look });
  });
}));
