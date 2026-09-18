/**
 * Server path for the entity generators whose only job is one JSON text call:
 * spell, monster, item, faction. Their art is a separate step the client
 * already routes through the server image pipeline, so this function is text
 * only.
 *
 * These four shipped with nothing but the local-key path, so every DM without
 * a key stored in the browser vault failed before a single request left the
 * page. One function keyed by generator rather than four copies of the same
 * three hundred lines: what differs between them is the system-prompt row and
 * the ledger reason, and both live in GENERATORS below. The per-generator
 * post-processing (overrides, ruleset stripping) stays on the client, where
 * the local path shares it.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** generator → the `ai_system_prompts` row it reads and the ledger reason it charges. */
const GENERATORS = {
  spell:   { promptKey: "spell",   reason: "spell_generation" },
  monster: { promptKey: "monster", reason: "monster_generation" },
  item:    { promptKey: "item",    reason: "item_generation" },
  faction: { promptKey: "faction", reason: "faction_generation" },
} as const;
type Generator = keyof typeof GENERATORS;

function isGenerator(value: unknown): value is Generator {
  return typeof value === "string" && Object.hasOwn(GENERATORS, value);
}

// Constraints are the panel's structured fields rendered as lines ("Level: 3").
// They are the DM's own input going into the DM's own generation, but they are
// still bounded so the body cannot smuggle a second prompt past the limit.
const MAX_CONSTRAINTS = 8;
const MAX_CONSTRAINT_CHARS = 300;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

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

  let campaign_id: string, prompt: string, generator: Generator, constraints: string[];
  try {
    const body = await req.json();
    if (typeof body.campaign_id !== "string" || typeof body.prompt !== "string") throw new Error("invalid");
    if (!isGenerator(body.generator)) throw new Error("invalid");
    const rawConstraints: unknown = body.constraints ?? [];
    if (
      !Array.isArray(rawConstraints) ||
      rawConstraints.length > MAX_CONSTRAINTS ||
      !rawConstraints.every((c) => typeof c === "string" && c.length <= MAX_CONSTRAINT_CHARS)
    ) throw new Error("invalid");
    campaign_id = body.campaign_id;
    prompt = body.prompt;
    generator = body.generator;
    constraints = rawConstraints as string[];
  } catch {
    return jsonError(
      `Invalid body — need { campaign_id, generator: ${Object.keys(GENERATORS).join("|")}, prompt, constraints? }`,
      400,
    );
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  const { promptKey, reason } = GENERATORS[generator];

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return jsonError("Campaign not found", 404);
  if (campaign.ai_enabled !== true) return jsonError("AI is disabled for this campaign", 403);

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return jsonError("Forbidden", 403);
  }

  // Ruleset-aware generation (#564) — anything other than "2024" resolves to "2014".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [promptKey, `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === promptKey);
  // A missing ruleset row is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return jsonError(`The ${generator} prompt is not configured`, 500);

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

  const systemContent = promptRow.content
    + (rulesetContext ? `\n\n${rulesetContext}` : "")
    + buildCampaignContext(campaign.ai_setting_prompt)
    + INJECTION_GUARD_SUFFIX;
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length
    ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
    : wrappedPrompt;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini" ? !!campaignGemini
    : !!campaignOpenai;

  const cost = textIsByok
    ? 0
    : applyMultiplier(
      await fetchCreditCost(admin, reason),
      providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier,
    );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return jsonError("rate_limited", 429);
  }

  const reservation = await reserveCredits(admin, user.id, cost, reason);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: {
        openai:    campaignOpenai    ?? platformKeys.openai    ?? null,
        anthropic: campaignAnthropic ?? platformKeys.anthropic ?? null,
        gemini:    campaignGemini    ?? platformKeys.gemini    ?? null,
      },
      model: providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model,
      system: systemContent,
      user: userContent,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) return jsonError(e.message, 422);
    console.error(`${generator} text generation failed:`, e);
    return jsonError(e instanceof Error ? e.message : "Text generation failed", 502);
  }

  let data: unknown;
  try {
    data = JSON.parse(textResult.content);
  } catch {
    // Nothing usable came back, so nothing is charged.
    await releaseCredits(admin, reservation.ids);
    console.error(`${generator} generation returned unparseable JSON`);
    return jsonError("The model returned an unreadable answer — try again.", 502);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    await releaseCredits(admin, reservation.ids);
    return jsonError("The model returned an unreadable answer — try again.", 502);
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, reason, textIsByok, cost, {
    model: textResult.usage.model,
    provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens,
    output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: reason,
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ ...data, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
