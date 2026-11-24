import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  fetchProviderConfigs,
  applyMultiplier,
} from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
} from "../_shared/ai-prompt.ts";
import { formatNpcUserInput, NPC_CONTEXT_LIMIT } from "../_shared/npcPrompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
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

interface NpcCampaign extends BaseCampaign {
  game_system: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : null;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : null;
  if (!body || !campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");
  const generateAlterEgo = body.generate_alter_ego === true;

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (context.length > NPC_CONTEXT_LIMIT) {
    return jsonError(400, "invalid_context", `NPC context exceeds the ${NPC_CONTEXT_LIMIT}-character limit.`);
  }

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<NpcCampaign>(admin, campaign_id, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  // ── Fetch system prompts from DB ────────────────────────────────────────────
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", ["npc", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "npc");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  // The platform decides the text model: the first provider the admin enabled. Refuse before anything is spent.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // ── Costs, all read before the hold ─────────────────────────────────────────
  const baseTextCost = await fetchCreditCost(admin, "npc_text");
  const textMultiplier = text.textMultiplier;
  // The text is the only charge: pictures are painted by generate-chronicle-image.
  const npcTextCost = wholeCredits(applyMultiplier(baseTextCost, textMultiplier));
  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent =
    promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) +
    INJECTION_GUARD_SUFFIX;

  const userContent = formatNpcUserInput(prompt, context, generateAlterEgo);

  const textModel = text.config?.text_model;

  // Hold the balance across the paid text call; the hold is released
  // whatever happens inside, and only what succeeded is charged.
  return withCreditHold(admin, { payerId: user.id, reason: "npc_text", cost: npcTextCost, report }, async (hold) => {
    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
      });
    } catch (e) {
      console.error("NPC text generation failed:", e);
      return jsonError(502, "generation_failed", "Text generation failed. Nothing was charged; please try again.");
    }

    let npcData: Record<string, unknown> | null;
    try {
      npcData = JSON.parse(textResult.content);
    } catch {
      npcData = null;
    }
    if (npcData === null || typeof npcData !== "object" || Array.isArray(npcData)) {
      return jsonError(502, "generation_failed", "The NPC came back unreadable. Nothing was charged; please try again.");
    }

    if (generateAlterEgo && (!npcData.disguise_name || !npcData.disguise_image_prompt)) {
      return jsonError(502, "generation_failed", "The AI response was missing disguise fields. Nothing was charged; please try again.");
    }

    hold.charge("npc_text", {
      cost: npcTextCost,
      log: {
        model: textResult.usage.model,
        provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens,
        output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: "npc_text",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...npcData, ai_provenance });
  });
}));
