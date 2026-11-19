import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  fetchCreditCost,
  wholeCredits,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  toPlainText,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import {
  premiseShape,
  sanitizePremise,
  sanitizeTruths,
  truthShape,
  type KnowerCandidate,
} from "../_shared/canonSuggestions.ts";

/**
 * Canon helpers (#1226 story 2, frame 13): "Draft from a pitch" proposes premise entries, "Suggest truths" proposes
 * truths with who knows them. NOTHING IS WRITTEN HERE: the reply is a list the DM accepts or dismisses one by one in
 * the client, which writes each (and a truth's `known_to` ties) itself.
 *
 * Server-path only, like suggest-connections: the premise and the candidate knowers are service-role reads the browser
 * cannot make. The prompt rows hold the editorial rules; the output shape and the grounding are code. Every answer
 * goes through `_shared/canonSuggestions.ts`, which refuses lines and veils and any knower that is not a real record.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Mode = "premise" | "truths";

const MODES: Record<Mode, { promptRow: string; ledger: string }> = {
  premise: { promptRow: "canon_premise", ledger: "canon_premise_suggestion" },
  truths: { promptRow: "canon_truths", ledger: "canon_truth_suggestion" },
};

const MAX_NPCS = 40;
const MAX_FACTIONS = 30;
const MAX_PCS = 20;

/** Every read is filtered by campaign in the query: the service-role client has no RLS to lean on. */
async function readRows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadKnowers(db: SupabaseClient, campaignId: string): Promise<KnowerCandidate[]> {
  const named = (table: string, limit: number) =>
    readRows<{ id: string; name: string }>(
      db.from(table).select("id, name").eq("campaign_id", campaignId).order("updated_at", { ascending: false }).limit(limit),
    );
  const [npcs, pcs, factions] = await Promise.all([
    named("npcs", MAX_NPCS),
    named("party_members", MAX_PCS),
    named("factions", MAX_FACTIONS),
  ]);
  return [
    ...npcs.map((r) => ({ kind: "npc" as const, id: r.id, name: r.name })),
    ...pcs.map((r) => ({ kind: "party_member" as const, id: r.id, name: r.name })),
    ...factions.map((r) => ({ kind: "faction" as const, id: r.id, name: r.name })),
  ];
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

  // Frozen or child accounts cannot generate, including BYOK (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let campaign_id: string, mode: Mode, prompt: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    if (typeof campaign_id !== "string" || !campaign_id) throw new Error("invalid");
    if (body.mode !== "premise" && body.mode !== "truths") throw new Error("invalid");
    mode = body.mode;
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return new Response("Invalid body: need { campaign_id, mode: 'premise' | 'truths' }", { status: 400 });
  }
  // The pitch is the whole input of "Draft from a pitch"; the truths helper takes an optional steer.
  if (mode === "premise" && prompt === "") {
    return new Response("Invalid body: a pitch is required", { status: 400 });
  }
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, game_system, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  // DMs only: the helper reads every truth, including secrets, with the service role, and a player must not
  // be able to ask the model to echo them.
  if (!(await isCampaignDm(admin, campaign, user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { promptRow: PROMPT_ROW, ledger: LEDGER_REASON } = MODES[mode];
  const rulesetKey = rulesetContextKey(campaign.game_system);
  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, ...(rulesetKey ? [rulesetKey] : [])]);
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext = promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
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

  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) {
    return new Response(
      JSON.stringify({ error: NO_TEXT_PROVIDER_MESSAGE }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(applyMultiplier(baseCost, text.textMultiplier));

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, LEDGER_REASON);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // Everything below can throw; a thrown error must not strand the hold.
  try {
    const world = await loadWorldBlock(admin, campaign.id);
    const steer = prompt ? `${wrapUserInput(prompt)}\n\n` : "";
    const base = (shape: string) => promptRow.content + shape + (rulesetContext ? `\n\n${rulesetContext}` : "") +
      worldBlockText(world) + INJECTION_GUARD_SUFFIX;

    let system: string;
    let user_: string;
    let sanitize: (parsed: unknown) => { suggestions: unknown[]; setAside: unknown[] };

    if (mode === "premise") {
      const rows = await readRows<{ premise_kind: string | null; title: string; body: string | null }>(
        admin.from("canon_entries").select("premise_kind, title, body").eq("campaign_id", campaign.id).eq("part", "premise"),
      );
      const existing = rows.map((r) => ({ kind: r.premise_kind, text: r.title.trim() || toPlainText(r.body).trim() }))
        .filter((r) => r.text !== "");
      system = base(premiseShape());
      user_ = `${steer}The DM's pitch is above. Entries the campaign already has (do not repeat them):\n` +
        (existing.length > 0 ? existing.map((e) => `- ${e.kind}: ${e.text}`).join("\n") : "(none yet)");
      sanitize = (parsed) => sanitizePremise(parsed, existing);
    } else {
      const [rows, candidates] = await Promise.all([
        readRows<{ title: string; knowledge: string | null }>(
          admin.from("canon_entries").select("title, knowledge").eq("campaign_id", campaign.id).eq("part", "truth"),
        ),
        loadKnowers(admin, campaign.id),
      ]);
      const titles = rows.map((r) => r.title.trim()).filter((t) => t !== "");
      system = base(truthShape());
      user_ = `${steer}Truths the campaign already has (do not repeat them):\n` +
        (rows.length > 0 ? rows.filter((r) => r.title.trim() !== "").map((r) => `- (${r.knowledge}) ${r.title.trim()}`).join("\n") : "(none yet)") +
        "\n\nPeople and factions that may know a truth. Every known_to name must be copied exactly from one of these lines:\n" +
        "---BEGIN PEOPLE---\n" +
        (candidates.length > 0 ? candidates.map((c) => `${c.kind}|${c.name}`).join("\n") : "(nobody yet: propose no 'some' truths)") +
        "\n---END PEOPLE---";
      sanitize = (parsed) => sanitizeTruths(parsed, candidates, titles);
    }

    let textResult: TextResult;
    try {
      textResult = await callText({ text, model: text.config?.text_model, system, user: user_, maxTokens: 2500 });
    } catch (e) {
      await releaseCredits(admin, reservation.ids);
      console.error("Canon suggestion text generation failed:", e);
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
        JSON.stringify({ error: "AI returned malformed suggestions, please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const { suggestions, setAside } = sanitize(parsed);
    if (suggestions.length === 0 && setAside.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "No usable suggestions. Try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    await releaseCredits(admin, reservation.ids);
    // Nothing the DM can accept is not a generation they pay for: show why, charge nothing.
    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ suggestions, setAside, ai_provenance: null }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    await recordGeneration(admin, user.id, LEDGER_REASON, text.isByok, cost, {
      model: textResult.usage.model, provider: textResult.usage.provider,
      input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
    });

    const ai_provenance: AiProvenance = {
      generatorType: LEDGER_REASON,
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return new Response(
      JSON.stringify({ suggestions, setAside, ai_provenance }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Canon suggestion failed:", e);
    return new Response(
      JSON.stringify({ error: "Could not build suggestions, please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}));
