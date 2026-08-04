import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_SHORT,
  INJECTION_GUARD_SUFFIX,
  toPlainText,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";

/**
 * At-the-table NPC dialogue suggester (#336).
 *
 * A player asks an NPC something the DM didn't prep for; this returns 2-3
 * short, speakable-as-is lines in the NPC's voice. Ephemeral — nothing is
 * saved — and latency-sensitive, so the context stays small on purpose:
 * no party query, no monster index, and no ruleset_context_* fetch (this is
 * pure dialogue with no rules content, so that context would be dead prompt
 * weight on a call where every extra round-trip is felt at the table).
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Bounds prompt cost — these fields are DM prose and can otherwise run long.
const PERSONALITY_CHAR_LIMIT = 800;
const BACKSTORY_CHAR_LIMIT = 600;
const NOTES_CHAR_LIMIT = 600;

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── NPC profile ───────────────────────────────────────────────────────────────

interface NpcRow {
  id: string;
  campaign_id: string | null;
  name: string;
  race: string | null;
  alignment: string | null;
  age: string | null;
  occupation: string | null;
  status: string;
  relationship: string;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
  disguise_name: string | null;
  is_revealed: boolean;
}

/**
 * Labelled NPC context for the model. Absent fields are omitted entirely
 * (never emitted as an empty "Label: ").
 *
 * Disguise handling: when the NPC has a disguise_name and hasn't been
 * revealed, the party is talking to the disguise, not the true identity.
 *
 * The true name is NOT sent to the model at all in that case. Supplying it
 * under a "do not reveal this" instruction is strictly weaker than withholding
 * it — the name contributes nothing to voice quality (personality, occupation
 * and backstory do all that work), while the failure mode is precisely the one
 * this feature must not have: a DM reading a suggested line aloud at speed and
 * blowing a reveal they have been building for months.
 *
 * The backstory is still supplied, because it is what makes the disguised
 * persona sound like a person, with an explicit instruction not to surface
 * anything from it that would expose the cover.
 */
function buildNpcProfile(npc: NpcRow): string {
  const disguised = !!npc.disguise_name && !npc.is_revealed;
  const lines: string[] = [];

  if (disguised) {
    lines.push(
      `IMPORTANT: This NPC is currently in disguise and has NOT been revealed. The party knows them only as ` +
      `"${npc.disguise_name}", and that is who is speaking. Stay entirely in that persona, and do not surface any ` +
      `backstory detail that would expose the disguise.`,
    );
    lines.push(`Name: ${npc.disguise_name}`);
  } else {
    lines.push(`Name: ${npc.name}`);
  }

  if (npc.race) lines.push(`Race: ${npc.race}`);
  if (npc.alignment) lines.push(`Alignment: ${npc.alignment}`);
  if (npc.age) lines.push(`Age: ${npc.age}`);
  if (npc.occupation) lines.push(`Occupation: ${npc.occupation}`);
  lines.push(`Status: ${npc.status}`);
  lines.push(`Relationship toward the party: ${npc.relationship}`);

  const personality = toPlainText(npc.personality).slice(0, PERSONALITY_CHAR_LIMIT);
  if (personality) lines.push(`Personality: ${personality}`);

  const backstory = toPlainText(npc.backstory).slice(0, BACKSTORY_CHAR_LIMIT);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  const notes = toPlainText(npc.notes).slice(0, NOTES_CHAR_LIMIT);
  if (notes) lines.push(`Notes: ${notes}`);

  return lines.join("\n");
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  // Frozen accounts cannot generate — including BYOK, which skips the credit gate.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let campaign_id: string, npc_id: string, situation: string;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    npc_id      = body.npc_id;
    situation   = body.situation;
    if (!campaign_id || !npc_id || !situation) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, npc_id, situation }", { status: 400 });
  }

  const promptCheck = validatePromptInput(situation, AI_PROMPT_LIMIT_SHORT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // The membership check above authorizes the campaign; this second check stops
  // a member of campaign A pulling an NPC that belongs to campaign B.
  const { data: npcRow } = await admin
    .from("npcs")
    .select("id, campaign_id, name, race, alignment, age, occupation, status, relationship, personality, backstory, notes, disguise_name, is_revealed")
    .eq("id", npc_id)
    .maybeSingle();
  if (!npcRow) return new Response("NPC not found", { status: 404 });
  const npc = npcRow as NpcRow;
  if (npc.campaign_id !== campaign_id) return new Response("Forbidden", { status: 403 });

  const { data: promptRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "npc_voice")
    .maybeSingle();
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  async function decryptKey(enc: string | null): Promise<string | null> {
    if (!enc || !ownerIsPro) return null;
    try { return await decryptValue(enc); } catch { return null; }
  }

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.anthropic_api_key),
      decryptKey(campaign.gemini_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  const openaiKey    = campaignOpenai    ?? platformKeys.openai    ?? null;
  const anthropicKey = campaignAnthropic ?? platformKeys.anthropic ?? null;
  const geminiKey    = campaignGemini    ?? platformKeys.gemini    ?? null;

  const systemContent = promptRow.content + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;
  const userContent = `${wrapUserInput(situation)}\n\nNPC Profile:\n${buildNpcProfile(npc)}`;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "npc_voice_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "npc_voice_generation");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      // Deliberately generous relative to the 2-3 short lines the prompt asks
      // for: OpenAI is called with response_format: json_object, so a response
      // truncated at the cap is invalid JSON, not just a short answer. The
      // prompt keeps the output brief; this cap only guards runaway cost.
      maxTokens: 350,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("NPC voice text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textResult.content);
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed dialogue — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawLines = (parsed as { lines?: unknown } | null)?.lines;
  const lines = Array.isArray(rawLines)
    ? rawLines
        .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
        .map((l) => l.trim())
        .slice(0, 3)
    : [];
  if (lines.length === 0) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed dialogue — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "npc_voice_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  return new Response(
    JSON.stringify({ lines }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
