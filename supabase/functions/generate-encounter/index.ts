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
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";

/**
 * Party-aware AI encounter suggester (#337).
 *
 * Text-only, like generate-downtime: there is no illustration, so no
 * `entity_image` charge and no image provider to resolve.
 *
 * The party summary and custom-monster index are built here, server-side,
 * from the campaign's own data rather than trusted from the request body —
 * a client-supplied context payload could otherwise be inflated (cost) or
 * spoofed (a bogus monster index steering the model toward names that don't
 * exist in the DM's bestiary).
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VALID_DIFFICULTIES: readonly string[] = ["easy", "medium", "hard", "deadly", "auto"] as const;

// Custom-monster index is capped to bound prompt cost on large bestiaries.
const MAX_CUSTOM_MONSTERS = 200;

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Server-side context building ─────────────────────────────────────────────

interface PartyMemberRow {
  id: string;
  name: string;
  class: string | null;
  level: number;
}

interface CharacterClassRow {
  party_member_id: string;
  class_name: string;
  levels: number;
}

/**
 * One line per party member: "Level 5 Fighter/Rogue". Multiclass characters
 * use the sum of character_classes.levels (the authoritative level) and their
 * class names joined with "/", not party_members.level/class, which are only
 * accurate for single-class characters. The class part is omitted entirely
 * (not an empty string) when neither source has it.
 */
function formatPartyLine(member: PartyMemberRow, classes: CharacterClassRow[]): string {
  if (classes.length > 0) {
    const totalLevel = classes.reduce((sum, c) => sum + c.levels, 0);
    const classNames = classes.map((c) => c.class_name).join("/");
    return `Level ${totalLevel} ${classNames}`;
  }
  if (member.class) return `Level ${member.level} ${member.class}`;
  return `Level ${member.level}`;
}

interface CustomMonsterRow {
  name: string;
  monster_type: string;
  stat_block: { challenge_rating?: string } | null;
}

// ── Text response contract ───────────────────────────────────────────────────

interface EncounterCombatant {
  name: string;
  count: number;
  role: string;
}

interface EncounterData {
  name: string;
  difficulty: string;
  environment: string;
  tactics: string;
  twist: string;
  combatants: EncounterCombatant[];
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

  let campaign_id: string, prompt: string, difficulty: string;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    prompt      = body.prompt;
    difficulty  = typeof body.difficulty === "string" ? body.difficulty : "auto";
    if (!campaign_id || !prompt) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt }", { status: 400 });
  }

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return new Response(
      `Invalid difficulty — must be one of ${VALID_DIFFICULTIES.join(", ")}`,
      { status: 400 },
    );
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled === false) return new Response("AI is disabled for this campaign", { status: 403 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // Ruleset-aware generation (#564) — anything other than "2024" resolves to "2014".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  // ── Server-side context: party summary + custom monster index ─────────────
  const { data: partyMemberRows } = await admin
    .from("party_members")
    .select("id, name, class, level")
    .eq("campaign_id", campaign_id);
  const partyMembers = (partyMemberRows ?? []) as PartyMemberRow[];

  let classesByMember = new Map<string, CharacterClassRow[]>();
  if (partyMembers.length > 0) {
    const { data: classRows } = await admin
      .from("character_classes")
      .select("party_member_id, class_name, levels")
      .in("party_member_id", partyMembers.map((m) => m.id));
    classesByMember = ((classRows ?? []) as CharacterClassRow[]).reduce((map, row) => {
      const list = map.get(row.party_member_id) ?? [];
      list.push(row);
      map.set(row.party_member_id, list);
      return map;
    }, new Map<string, CharacterClassRow[]>());
  }

  const partySummary = partyMembers.length > 0
    ? `Party:\n${partyMembers.map((m) => formatPartyLine(m, classesByMember.get(m.id) ?? [])).join("\n")}`
    : "Party: unknown — assume 4 characters of level 3";

  // monsters has no campaign_id column — the bestiary is user-scoped, so it is
  // filtered by the campaign owner instead. Excludes Open5e-imported rows (the
  // model already knows standard 5e monsters) and rows pinned to another ruleset.
  const { data: customMonsterRows, count: customMonsterTotal } = await admin
    .from("monsters")
    .select("name, monster_type, stat_block", { count: "exact" })
    .eq("user_id", campaign.user_id)
    .or("open5e_import.is.null,open5e_import.eq.false")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name")
    .limit(MAX_CUSTOM_MONSTERS);
  const customMonsters = (customMonsterRows ?? []) as CustomMonsterRow[];

  // The cap is ordered by name, so crossing it silently hands the model an
  // A–G slice of the bestiary and it never learns the rest exists. Count the
  // full set so the prompt can say the index is partial — a truncation the
  // model is told about is a limitation; one it isn't is a bug that looks
  // like the AI "ignoring" the DM's monsters.
  const customMonsterTruncated =
    typeof customMonsterTotal === "number" && customMonsterTotal > customMonsters.length;
  if (customMonsterTruncated) {
    console.warn(
      `Custom monster index truncated for campaign ${campaign_id}: sent ${customMonsters.length} of ${customMonsterTotal}`,
    );
  }

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["encounter", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "encounter");
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

  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const constraints: string[] = [`Difficulty: ${difficulty}`, partySummary];
  if (customMonsters.length > 0) {
    const monsterLines = customMonsters.map((m) => `${m.name}|${m.stat_block?.challenge_rating ?? "?"}|${m.monster_type}`);
    const truncationNote = customMonsterTruncated
      ? ` NOTE: this is the first ${customMonsters.length} of ${customMonsterTotal} custom monsters, ordered by name — the DM has others not shown here.`
      : "";
    constraints.push(
      "Custom Monster Index — the DM's own creations; prefer these when one fits the concept thematically. " +
      "One per line as Name|CR|type. Use the exact name shown when picking from this list." +
      truncationNote + "\n" +
      "---BEGIN CUSTOM MONSTER INDEX---\n" +
      monsterLines.join("\n") +
      "\n---END CUSTOM MONSTER INDEX---",
    );
  }
  const userContent = `${wrapUserInput(prompt)}\n\nConstraints:\n${constraints.join("\n")}`;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "encounter_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "encounter_generation");
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
      maxTokens: 1200,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Encounter text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let encounterData: EncounterData;
  try {
    encounterData = JSON.parse(textResult.content) as EncounterData;
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed encounter data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!Array.isArray(encounterData.combatants) || encounterData.combatants.length === 0) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed encounter data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "encounter_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  return new Response(
    JSON.stringify(encounterData),
    { headers: { "Content-Type": "application/json" } },
  );
}));
