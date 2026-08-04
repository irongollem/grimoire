import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordFreeGeneration,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
} from "../_shared/credits.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import { retrieveCampaignEntities, formatEntityBlock } from "../_shared/campaignEntityRetrieval.ts";
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

/**
 * Drafts the outcome of one downtime draw (#486, Phase 3).
 *
 * Text-only by design: the Interlude's activity cards render a procedural face
 * from `accent` + `glyph`, so there is no illustration to generate — which means
 * no `entity_image` charge, no image provider to resolve, and no remote-image
 * fetch (and therefore no SSRF surface) in this function.
 *
 * The returned shape mirrors a `DowntimeSeed`, so the client can feed it into
 * the existing resolve path unchanged rather than growing a parallel one.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Text providers ────────────────────────────────────────────────────────────

interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
interface TextResult { content: string; usage: TextUsage }

async function openaiText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI text error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.choices[0].message.content as string,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, model, provider: "openai" },
  };
}

async function anthropicText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 4096,
      system: system + "\n\nRespond with a valid JSON object only, no markdown fencing.",
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.content[0].text as string,
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0, model, provider: "anthropic" },
  };
}

async function geminiText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json();
  const meta = data.usageMetadata ?? {};
  return {
    content: data.candidates[0].content.parts[0].text as string,
    usage: { input_tokens: meta.promptTokenCount ?? 0, output_tokens: meta.candidatesTokenCount ?? 0, model, provider: "google" },
  };
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

  let campaign_id: string, activity_key: string, activity_title: string,
      reward_kind: string, character_name: string | undefined, prompt: string;

  try {
    const body = await req.json();
    campaign_id    = body.campaign_id;
    activity_key   = body.activity_key;
    activity_title = body.activity_title;
    reward_kind    = body.reward_kind;
    character_name = body.character_name;
    // The DM's optional steer. Always a string so the prompt guard can run on it.
    prompt         = typeof body.prompt === "string" ? body.prompt : "";
    if (!campaign_id || !activity_key || !activity_title || !reward_kind) throw new Error("invalid");
  } catch {
    return new Response(
      "Invalid body — need { campaign_id, activity_key, activity_title, reward_kind }",
      { status: 400 },
    );
  }

  // The steer is optional, but if present it is untrusted user text like any other.
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled === false) return new Response("AI is disabled for this campaign", { status: 403 });

  // Only the DM resolves draws, so drafting an outcome is a DM-only act. A player
  // who is merely a campaign member must not be able to spend the owner's credits
  // here — hence owner-only, not the membership check the trap generator uses.
  if (campaign.user_id !== user.id) return new Response("Forbidden", { status: 403 });

  // Ruleset-aware generation (#564) — anything other than "2024" resolves to "2014".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["downtime", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "downtime");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
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

  const systemContent =
    promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) +
    INJECTION_GUARD_SUFFIX;

  // The archetype and reward kind are OUR values, not the caller's prose — they go
  // in as plain constraints. Only the DM's steer is wrapped as untrusted input.
  const constraints = [
    `Archetype: ${activity_title} (${activity_key})`,
    `reward.kind MUST be: ${reward_kind}`,
  ];
  if (character_name) constraints.push(`Character: ${character_name}`);

  const userContent = prompt
    ? `${wrapUserInput(prompt)}\n\nConstraints:\n${constraints.join("\n")}`
    : `Draft the outcome.\n\nConstraints:\n${constraints.join("\n")}`;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "downtime_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "downtime_generation");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // ── Semantic retrieval (#600 — the fourth grounded generator) ──────────────
  // An ENHANCEMENT, not a requirement, same contract as generate-quest /
  // generate-roll-table / generate-chronicle-text: any failure drops the
  // block and the prompt degrades to exactly the pre-#600 behavior. Sits
  // after the rate-limit + reservation gates for the same
  // unbounded-embed-spend reason generate-quest documents.
  //
  // Grounding is INPUT-side only, like the Chronicler: the outcome's
  // vignette is prose and its reward entity is net-new by design
  // (npcInsertFromSeed creates a fresh NPC), so nothing resolves back to
  // rows and no chip surface exists. Offering the campaign's real shops,
  // contacts and locations lets the vignette weave them in by exact name.
  //
  // The DM's steer is optional and usually empty, so the semantic query is
  // composed from what always exists: the activity archetype and character,
  // plus the steer when present — "Carousing — Wilhelm" retrieves taverns
  // and drinking companions even with no steer at all.
  let entityBlock = "";
  try {
    const embedProvider = await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
    const query = [activity_title, character_name, prompt].filter(Boolean).join(" — ");
    const { vectors, usage: embedUsage } = await embedProvider.embed([query]);

    // Recorded HERE — real provider spend was incurred the moment embed()
    // returned; everything after this point can throw into the catch.
    await recordFreeGeneration(admin, user.id, "entity_embedding", {
      model:        embedProvider.model,
      provider:     embedUsage.provider,
      input_tokens: embedUsage.input_tokens,
    });

    const candidates = await retrieveCampaignEntities(admin, {
      queryVector:    toVectorLiteral(vectors[0]),
      campaignId:     campaign_id,
      // Owner and caller are the same user here (owner-only gate above), so
      // unlike the sibling generators there is no owner-vs-caller nuance.
      ownerId:        campaign.user_id,
      embeddingModel: embedProvider.model,
    });
    if (candidates.npcs.length + candidates.locations.length + candidates.factions.length > 0) {
      entityBlock = formatEntityBlock(candidates, "drafting the outcome");
    }
  } catch (e) {
    // Diagnosable, but never fatal.
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.warn(`Downtime retrieval unavailable for campaign ${campaign_id}, falling back to the ungrounded prompt: ${why}`);
    entityBlock = "";
  }
  const groundedUserContent = `${userContent}${entityBlock}`;

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, textModel ?? "claude-haiku-3-20240307", systemContent, groundedUserContent);
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, textModel ?? "gemini-2.5-flash", systemContent, groundedUserContent);
    } else {
      if (!openaiKey) {
        await releaseCredits(admin, reservation.ids);
        return new Response("No OpenAI API key configured", { status: 422 });
      }
      textResult = await openaiText(openaiKey, textModel ?? "gpt-4o-mini", systemContent, groundedUserContent);
    }
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Downtime outcome generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let outcome: Record<string, unknown>;
  try {
    outcome = JSON.parse(textResult.content) as Record<string, unknown>;
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "The model returned malformed JSON. Try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "downtime_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: "downtime_generation",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ ...outcome, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
