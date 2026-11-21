import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_SHORT,
  INJECTION_GUARD_SUFFIX,
  toPlainText,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { campaignToday } from "../_shared/npcAge.ts";
import {
  BACKSTORY_CHAR_LIMIT,
  buildNpcProfile,
  NPC_PROFILE_COLUMNS,
  type NpcProfileRow,
} from "../_shared/npcProfile.ts";
import { formatNpcMemories, loadPromptMemories } from "../_shared/npcMemories.ts";
import { judge, JEV_MODEL, noulOf, scoreOf } from "../_shared/typesafe.ts";
import { MEMORY_CANDIDATE_LIMIT, pickPromptMemories, RELEVANCE_QUESTION } from "./memoryRelevance.ts";
import { buildHiddenIdentity, checkLinesForReveal, REVEAL_QUESTION } from "./disguiseCheck.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";

/**
 * At-the-table NPC dialogue suggester (#336).
 *
 * A player asks an NPC something the DM didn't prep for; this returns 2-3
 * short, speakable-as-is lines in the NPC's voice. Nothing is saved here (the
 * client stores a line only when the DM marks it as said), and the call is
 * latency-sensitive, so the context stays small on purpose:
 * no party query, no monster index, and no ruleset_context_* fetch (this is
 * pure dialogue with no rules content, so that context would be dead prompt
 * weight on a call where every extra round-trip is felt at the table).
 *
 * The one exception is the NPC's memory ledger (#1019, npc_memories): the newest
 * few lines of what it and the party have told each other go in after the
 * profile, so a suggested line does not contradict last session. The disguise
 * rule below covers them too (formatNpcMemories masks the true name). A failed
 * memory read never fails the generation.
 *
 * With a `typesafe` platform key two small judgments run (#1061, both free to the
 * user and recorded as `entity_judgment`): the newest 60 memories are scored for
 * how much they bear on the situation and the prompt carries the most relevant
 * twelve, and for a disguised NPC each suggested line is checked for giving the
 * disguise away (a flagged line is returned with `reveals: true`, never dropped).
 * Without the key, or when judging fails, the function behaves as it did before.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Handler ───────────────────────────────────────────────────────────────────

interface VoiceCampaign extends BaseCampaign {
  text_provider: string | null;
  current_year: number | null;
  current_month: number | null;
  current_day: number | null;
}

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = optionalString(body?.campaign_id);
  const npc_id = optionalString(body?.npc_id);
  const situation = optionalString(body?.situation);
  if (!campaign_id || !npc_id || !situation) {
    return jsonError(400, "invalid_body", "Need { campaign_id, npc_id, situation }.");
  }

  const promptCheck = validatePromptInput(situation, AI_PROMPT_LIMIT_SHORT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: this reads DM-only campaign content with the service role (see
  // _shared/campaignAccess.ts for why a player member must not get through).
  const load = await loadAiCampaign<VoiceCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "current_year", "current_month", "current_day"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // The access check above authorizes the campaign; this second check stops
  // a DM of campaign A pulling an NPC that belongs to campaign B.
  const { data: npcRow, error: npcError } = await admin
    .from("npcs")
    .select(NPC_PROFILE_COLUMNS)
    .eq("id", npc_id)
    .maybeSingle();
  if (npcError) throw npcError;
  if (!npcRow) return jsonError(404, "npc_not_found", "NPC not found.");
  const npc = npcRow as NpcProfileRow;
  if (npc.campaign_id !== campaign_id) return jsonError(403, "forbidden", "That NPC is not in this campaign.");

  // Started now and awaited when the prompt is built, so the memory read runs
  // alongside the prompt, plan, key and provider lookups below instead of after
  // them. It never rejects: a failed read answers with no memories.
  const memoriesPending = loadPromptMemories(admin, npc.id, campaign_id, MEMORY_CANDIDATE_LIMIT);

  const { data: promptRow, error: promptError } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "npc_voice")
    .maybeSingle();
  if (promptError) throw promptError;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini", "typesafe"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + worldBlockText(world) + INJECTION_GUARD_SUFFIX;
  // Judging is an enhancement: a missing key, or any failure, leaves the newest twelve.
  const jevKey = platformKeys.typesafe && platformKeys.typesafe.length > 0 ? platformKeys.typesafe : null;
  let jevTokens = 0;
  let jevJudged = 0;
  const picked = await pickPromptMemories({
    candidates: await memoriesPending,
    situation,
    identity: npc,
    apiKey: jevKey,
    judgeScore: async (request, signal) => {
      const res = await judge(request, { apiKey: jevKey!, signal });
      return { score: scoreOf(res, RELEVANCE_QUESTION), inputTokens: res.inputTokens };
    },
  });
  jevTokens += picked.inputTokens;
  jevJudged += picked.judged;
  const memoryBlock = formatNpcMemories(picked.memories, npc);
  const userContent =
    `${wrapUserInput(situation)}\n\nNPC Profile:\n${buildNpcProfile(npc, campaignToday(campaign))}` +
    (memoryBlock ? `\n\n${memoryBlock}` : "");

  // The platform decides the text model: a campaign on platform credits runs on
  // whichever provider the admin enabled, and `campaign.text_provider` only counts
  // when the campaign holds its own key for it. Refuse before anything is spent.
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, "npc_voice_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  return withCreditHold(admin, { payerId: user.id, reason: "npc_voice_generation", cost, report }, async (hold) => {
    try {
      let textResult: TextResult;
      try {
        textResult = await callText({
          text,
          model: text.config?.text_model,
          system: systemContent,
          user: userContent,
          // Deliberately generous relative to the 2-3 short lines the prompt asks
          // for: OpenAI is called with response_format: json_object, so a response
          // truncated at the cap is invalid JSON, not just a short answer. The
          // prompt keeps the output brief; this cap only guards runaway cost.
          maxTokens: 350,
        });
      } catch (e) {
        console.error("NPC voice text generation failed:", e);
        return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
      }

      const malformed = () => jsonError(502, "generation_failed", "AI returned malformed dialogue. Nothing was charged; please try again.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(textResult.content);
      } catch {
        return malformed();
      }

      const rawLines = (parsed as { lines?: unknown } | null)?.lines;
      const lines = Array.isArray(rawLines)
        ? rawLines
            .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
            .map((l) => l.trim())
            .slice(0, 3)
        : [];
      if (lines.length === 0) return malformed();

      hold.charge("npc_voice_generation", {
        cost,
        isByok: text.isByok,
        log: {
          model: textResult.usage.model, provider: textResult.usage.provider,
          input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
        },
      });

      // The disguise check. The true name and the backstory go to TypeSafe here:
      // the same data this function already sends to the text model for generation,
      // under the same AI switch, so it adds a processor but no new category of data.
      // An enhancement: a failure leaves every line unflagged.
      let reveals = lines.map(() => false);
      if (jevKey && !!npc.disguise_name && !npc.is_revealed) {
        try {
          const check = await checkLinesForReveal({
            lines,
            hidden: buildHiddenIdentity(npc.name, toPlainText(npc.backstory).slice(0, BACKSTORY_CHAR_LIMIT), npc.disguise_name),
            judgeReveal: async (request, signal) => {
              const res = await judge(request, { apiKey: jevKey, signal });
              return { probability: noulOf(res, REVEAL_QUESTION), inputTokens: res.inputTokens };
            },
          });
          reveals = check.reveals;
          jevTokens += check.inputTokens;
          jevJudged += check.judged;
        } catch (e) {
          console.error("NPC voice disguise check failed:", e);
        }
      }

      // The provider and model ride along so a line the DM marks as said is stored
      // with its provenance (npc_memories.ai_provenance, #1019).
      const ai_provenance: AiProvenance = {
        generatorType: "npc_voice",
        provider: textResult.usage.provider,
        model: textResult.usage.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      return json({
        lines: lines.map((text, i) => ({ text, reveals: reveals[i] })),
        provider: textResult.usage.provider,
        model: textResult.usage.model,
        ai_provenance,
      });
    } finally {
      // One row per call, platform-paid: the tokens were spent whatever the
      // verdicts, and whatever became of the generation (the memory judging
      // ran before the hold, so an early refusal must not lose it).
      if (jevJudged > 0) {
        hold.free("entity_judgment", { model: JEV_MODEL, provider: "typesafe", input_tokens: jevTokens });
      }
    }
  });
}));
