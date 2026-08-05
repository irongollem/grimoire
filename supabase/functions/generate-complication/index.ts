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
  recordFreeGeneration,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_SHORT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import {
  retrieveCampaignEntities,
  formatEntityBlock,
  type CandidateEntity,
} from "../_shared/campaignEntityRetrieval.ts";
import { retrieveMonsterCandidates, type CandidateMonster } from "../_shared/monsterRetrieval.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

/**
 * Mid-fight complication / reinforcement generator (#604).
 *
 * Two modes, one function, because they differ only in prompt row and in
 * which retrieval matters most:
 *
 *   "complication"   — the fight needs a turn, not more hit points. Grounded
 *                      in the DM's NPCs/factions/locations AND their bestiary,
 *                      because a complication may or may not bring creatures.
 *   "reinforcements" — the fight is ending too fast. Bestiary-led; the entity
 *                      corpora still ride along so the arriving patrol can
 *                      belong to a real faction.
 *
 * NOTHING THIS RETURNS HAPPENS ON ITS OWN. The response is a proposal: the
 * client resolves the creature names, shows the DM exactly what would land,
 * and only on their confirmation does it become an UNFIRED manual event that
 * still needs the ▶ button. This function therefore never asks the model for
 * a trigger, and the client never reads one — a generated event that could
 * auto-fire on a round boundary is precisely the "things happen the DM didn't
 * want" failure this design is built to prevent.
 *
 * Server-path only, like generate-loot: the candidate blocks come from
 * service-role reads the browser cannot make, and BYOK-local is a legacy tier
 * that new AI features do not ship a second, weaker path for.
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

type Mode = "complication" | "reinforcements";

/** DB `ai_system_prompts.generator_type` per mode — see the migration for why
 *  these are two rows rather than one prompt with a switch inside it. */
const PROMPT_ROW: Record<Mode, string> = {
  complication:   "complication",
  reinforcements: "complication_reinforcements",
};

function isMode(value: unknown): value is Mode {
  return value === "complication" || value === "reinforcements";
}

// Retrieval sizes. Reinforcements lean on creatures, complications on the
// campaign's cast, so the bestiary share flips between modes rather than being
// one compromise number that serves neither.
const MONSTERS_PER_SIDE: Record<Mode, number> = { complication: 6, reinforcements: 12 };
const MAX_UNEMBEDDED_MONSTERS = 8;

// ── Live encounter snapshot ─────────────────────────────────────────────────

/**
 * The state of the fight, as the runner sees it.
 *
 * Sent by the client rather than read from `encounter_state` server-side, and
 * that is deliberate: the runner's store is the live truth, while the DB row
 * lags behind it by up to a 300 ms debounce (useEncounterLive.schedulePush) —
 * and a DM who has not gone live at all has no row whatsoever. Trusting the
 * client here costs nothing: this is the DM's own encounter, the snapshot
 * grants no privilege, and the only thing it influences is the flavour of a
 * proposal they must then approve.
 */
interface EncounterSnapshot {
  name?: string;
  round?: number;
  factions?: string[];
  combatants?: { name: string; faction: string; hp_pct: number; is_player: boolean }[];
}

const MAX_SNAPSHOT_COMBATANTS = 30;

function formatSnapshot(snapshot: EncounterSnapshot): string {
  const lines: string[] = [];
  if (snapshot.name) lines.push(`Encounter: ${snapshot.name}`);
  if (typeof snapshot.round === "number") lines.push(`Current round: ${snapshot.round}`);
  if (snapshot.factions?.length) lines.push(`Sides: ${snapshot.factions.join(", ")}`);

  const combatants = (snapshot.combatants ?? []).slice(0, MAX_SNAPSHOT_COMBATANTS);
  if (combatants.length > 0) {
    lines.push("On the board (name | side | remaining HP):");
    for (const c of combatants) {
      const pct = Number.isFinite(c.hp_pct) ? Math.max(0, Math.min(100, Math.round(c.hp_pct))) : 100;
      lines.push(`${c.is_player ? "PC " : ""}${c.name}|${c.faction}|${pct}%`);
    }
  }
  return lines.length > 0 ? `\n\nThe fight as it stands right now:\n${lines.join("\n")}` : "";
}

/** Creature candidates, as `Name|CR|type` lines. Separate from the entity
 *  block because these resolve against the BESTIARY downstream, not against
 *  npcs/locations/factions, and the client needs to know which list a name
 *  came from to look it up in the right place. */
function formatMonsterBlock(candidates: CandidateMonster[]): string {
  const lines = candidates.map((c) => `${c.name}|${c.cr}|${c.type}`);
  return (
    "\n\nCreatures available to this campaign (name|CR|type) — the DM's own bestiary plus the " +
    "sources they have enabled. Any creature you bring in must be named EXACTLY as shown here; " +
    "the app resolves these to real stat blocks, and a name it cannot resolve puts nothing on " +
    "the board.\n" +
    "---BEGIN CREATURES---\n" +
    lines.join("\n") +
    "\n---END CREATURES---"
  );
}

// ── Text response contract ───────────────────────────────────────────────────

/**
 * A PROPOSED complication. Nothing here is validated field-by-field beyond
 * `narration` being present — the client resolves names, clamps counts and
 * maps sides to real factions (src/ai/resolveGeneratedComplication.ts), and it
 * is the single validation point for both what the DM previews and what the
 * event ends up containing. A server-side second opinion would only be a
 * second thing to keep in step.
 */
interface ComplicationAiResult {
  name: string;
  narration: string;
  reinforcements?: { name: string; count?: number; side?: string; role?: string | null }[];
  environment?: { label: string; description: string } | null;
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

  let campaign_id: string, mode: Mode, prompt: string, snapshot: EncounterSnapshot;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    if (!campaign_id) throw new Error("invalid");
    if (!isMode(body.mode)) throw new Error("invalid");
    mode = body.mode;
    // The steer is OPTIONAL here, unlike every other generator in this repo.
    // Mid-fight the DM often wants "just give me something" with both hands on
    // the initiative tracker; the encounter snapshot below is already a richer
    // prompt than most generators get from typed input.
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    snapshot = (body.snapshot ?? {}) as EncounterSnapshot;
  } catch {
    return new Response("Invalid body — need { campaign_id, mode }", { status: 400 });
  }

  // _SHORT (500): this is a one-line steer typed mid-combat, not a composed
  // multi-field prompt. Empty passes — validatePromptInput is only reached
  // when the DM actually typed something.
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
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

  // Ruleset-aware generation (#564) — anything other than "2024" resolves to "2014".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const promptType = PROMPT_ROW[mode];
  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [promptType, `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === promptType);
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

  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "complication_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block, not just above callText.
  // Retrieval makes its own billed embedding request, and because that request
  // is recorded at delta 0 it never touches the caller's balance — so the
  // reservation is not a second line of defence for it. Gate first, embed
  // after. This function is also the most press-happy surface in the app: it
  // is a button beside the initiative tracker, and a DM hunting for a
  // complication they like will press it several times in a row. That is
  // expected use, and the shared bucket is what keeps it from becoming
  // unbounded platform spend.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "complication_generation");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // ── Semantic retrieval (#595 bestiary + #600 entities) ─────────────────────
  // An ENHANCEMENT, never a requirement. Both corpora are retrieved from ONE
  // embedding of the same query text, and the whole block is one try/catch:
  // a partially-grounded proposal (real NPCs, hallucinated creatures) is a
  // worse failure than an ungrounded one, because unresolvable creature names
  // put nothing on the board and the DM only finds out at the preview.
  let entities: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] } =
    { npcs: [], locations: [], factions: [] };
  let monsters: CandidateMonster[] = [];

  // What the retrieval query is ABOUT: the DM's steer when they typed one,
  // otherwise the fight itself. Embedding an empty string would return an
  // arbitrary corner of the corpus, so the snapshot is the fallback query
  // rather than merely extra context.
  const retrievalQuery = prompt.trim() ||
    [snapshot.name, ...(snapshot.combatants ?? []).slice(0, 10).map((c) => c.name)]
      .filter(Boolean).join(", ") ||
    "a mid-combat complication";

  try {
    const embedProvider = await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
    const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQuery]);

    // Recorded HERE, not after the RPCs below — real provider spend was
    // incurred the moment embed() returned, and everything after this point
    // can throw into the catch. Platform-paid, charged to nobody.
    await recordFreeGeneration(admin, user.id, "entity_embedding", {
      model:        embedProvider.model,
      provider:     embedUsage.provider,
      input_tokens: embedUsage.input_tokens,
    });

    const queryVector = toVectorLiteral(vectors[0]);
    // The OWNER, not the caller — a co-DM generating a complication sees the
    // campaign owner's cast and bestiary, matching every other grounded
    // generator's scoping.
    [entities, monsters] = await Promise.all([
      retrieveCampaignEntities(admin, {
        queryVector,
        campaignId:     campaign_id,
        ownerId:        campaign.user_id,
        embeddingModel: embedProvider.model,
      }),
      retrieveMonsterCandidates(admin, {
        queryVector,
        ownerId:        campaign.user_id,
        campaignId:     campaign_id,
        ruleset,
        embeddingModel: embedProvider.model,
        perSide:        MONSTERS_PER_SIDE[mode],
        unembeddedCap:  MAX_UNEMBEDDED_MONSTERS,
      }),
    ]);
  } catch (e) {
    // Diagnosable, but never fatal.
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.warn(`Complication retrieval unavailable for campaign ${campaign_id}, generating without candidate blocks: ${why}`);
    entities = { npcs: [], locations: [], factions: [] };
    monsters = [];
  }

  const entityCount = entities.npcs.length + entities.locations.length + entities.factions.length;
  const entityBlock = entityCount > 0 ? formatEntityBlock(entities, "writing the complication") : "";
  const monsterBlock = monsters.length > 0 ? formatMonsterBlock(monsters) : "";

  // An empty steer is normal here (see the body parse), so the user content
  // may be snapshot + candidates alone. wrapUserInput is applied only to text
  // the DM actually typed — wrapping an empty string would tell the model it
  // was handed an empty instruction.
  const steer = prompt.trim() ? wrapUserInput(prompt.trim()) : "";
  const userContent = `${steer}${formatSnapshot(snapshot)}${entityBlock}${monsterBlock}`;

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      // One short object: a name, a few sentences of narration, and at most a
      // handful of reinforcement entries. Far smaller than a quest batch or a
      // 1d100 table, and mid-combat latency matters more here than headroom.
      maxTokens: 900,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Complication text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let data: ComplicationAiResult;
  try {
    data = JSON.parse(textResult.content) as ComplicationAiResult;
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned a malformed complication — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  // Narration is the one field with no useful fallback: an event the DM cannot
  // read out is not a complication. Everything else is optional by design and
  // is normalised client-side.
  if (typeof data.narration !== "string" || !data.narration.trim()) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned a malformed complication — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "complication_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: "complication_generation",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    // `grounded` tells the panel whether unresolvable creature names are the
    // model guessing (retrieval down / bestiary not embedded) or simply a
    // creature this campaign does not have.
    JSON.stringify({ ...data, mode, grounded: monsters.length > 0, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
