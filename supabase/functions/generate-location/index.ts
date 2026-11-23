import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, resolveTextProvider, NO_TEXT_PROVIDER_MESSAGE, type TextResult } from "../_shared/textGen.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface LocationCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
}

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = optionalString(body?.campaign_id);
  const prompt = optionalString(body?.prompt);
  if (!body || !campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");
  const location_type = optionalString(body.location_type);
  const parent_name = optionalString(body.parent_name);

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<LocationCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["location", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "location");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  const constraints: string[] = [];
  if (location_type) constraints.push(`Location Type: ${location_type}`);
  if (parent_name) constraints.push(`Parent Location: ${parent_name}`);
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}` : wrappedPrompt;

  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseLocationCost = text.isByok ? 0 : await fetchCreditCost(admin, "location_generation");
  const locationCost = wholeCredits(
    applyMultiplier(baseLocationCost, text.textMultiplier),
  );
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Hold the balance across the paid text call; the hold is released whatever happens inside, and only
  // what succeeded is charged.
  return withCreditHold(admin, { payerId: user.id, reason: "location_generation", cost: locationCost, report }, async (hold) => {
    let textResult: TextResult;

    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
      });
    } catch (e) {
      console.error("Location text generation failed:", e);
      return jsonError(502, "generation_failed", "Text generation failed. Nothing was charged; please try again.");
    }

    let locationData: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(textResult.content);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      locationData = parsed as Record<string, unknown>;
    } catch {
      return jsonError(502, "generation_failed", "The location came back unreadable. Nothing was charged; please try again.");
    }

    // Log text generation (with credit deduction), the moment it has produced a usable result.
    hold.charge("location_generation", {
      cost: locationCost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: "location_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...locationData, ai_provenance });
  });
}));
