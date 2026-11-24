/**
 * Server path for the entity generators whose only job is one JSON text call:
 * spell, monster, item, faction, and (epic #910) dungeon feature, deity,
 * species, background, class, archetype, ability, house rule, recipe,
 * calendar event, site room, quest beat and puzzle. Their art is a separate step the
 * client already routes through the server image pipeline, so this function
 * is text only. One generator is not an entity at all: `text_enhancement`
 * (#992) rewrites a selection in a rich-text editor and answers in Markdown,
 * which is what `format: "text"` below is for.
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
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { gameSystemEdition, NO_RULES_SYSTEM_MESSAGE, rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  AI_PROMPT_LIMIT,
  AI_PROMPT_LIMIT_LONG,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { vetGeneratedSpell } from "../_shared/spellGeneration.ts";
import { SPELL_CONDITION_EFFECT_PROMPT } from "../../../src/lib/spells/spellConditionPrompt.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextOutputFormat, type TextResult } from "../_shared/textGen.ts";
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

interface EntityCampaign extends BaseCampaign {
  game_system: string | null;
}

/** generator → the `ai_system_prompts` row it reads and the ledger reason it charges. */
// The prompt key is the generator's own name, because the client's local-key
// path (src/ai/entityTextGeneration.ts) reads `ai_system_prompts` by it; the
// first four predate that rule and keep their historical ledger reasons.
interface GeneratorSpec {
  promptKey: string;
  reason: string;
  /** "json" (the default) answers with an object; "text" with Markdown, returned as `content`. */
  format?: TextOutputFormat;
  /** Longest accepted prompt; AI_PROMPT_LIMIT unless the input is the DM's own prose. */
  promptLimit?: number;
  /** The output is shaped by D&D 5e rules (stat blocks, class tables, the item library): a Generic campaign gets none (#934). */
  fiveE?: true;
  /** Appended to the stored prompt, for what a generator must be told that its row does not yet say. */
  extraInstructions?: string;
}

const GENERATORS = {
  // The stored prompt predates `condition_effect` (#1021): its instruction rides along from code.
  spell:           { promptKey: "spell",           reason: "spell_generation", fiveE: true, extraInstructions: SPELL_CONDITION_EFFECT_PROMPT },
  // `monster_stat_block` is the row the admin prices and the page quotes. This read `monster_generation` until
  // #1253, a key with no row, so the server always charged the 1-credit fallback whatever the admin set.
  monster:         { promptKey: "monster",         reason: "monster_stat_block", fiveE: true },
  item:            { promptKey: "item",            reason: "item_generation", fiveE: true },
  faction:         { promptKey: "faction",         reason: "faction_generation" },
  feature:         { promptKey: "feature",         reason: "feature_generation", fiveE: true },
  deity:           { promptKey: "deity",           reason: "deity_generation" },
  species:         { promptKey: "species",         reason: "species_generation", fiveE: true },
  background:      { promptKey: "background",      reason: "background_generation", fiveE: true },
  custom_class:    { promptKey: "custom_class",    reason: "custom_class_generation", fiveE: true },
  custom_subclass: { promptKey: "custom_subclass", reason: "custom_subclass_generation", fiveE: true },
  class_feature:   { promptKey: "class_feature",   reason: "class_feature_generation", fiveE: true },
  custom_rule:     { promptKey: "custom_rule",     reason: "custom_rule_generation" },
  recipe:          { promptKey: "recipe",          reason: "recipe_generation", fiveE: true },
  calendar_event:  { promptKey: "calendar_event",  reason: "calendar_event_generation" },
  room:            { promptKey: "room",            reason: "room_generation" },
  quest_beat:      { promptKey: "quest_beat",      reason: "quest_beat_generation" },
  puzzle:          { promptKey: "puzzle",          reason: "puzzle_generation" },
  // #992: the prompt is the DM's selected passage, which runs longer than a
  // concept line, and the answer is prose rather than an object.
  text_enhancement: {
    promptKey: "text_enhancement", reason: "text_enhancement",
    format: "text", promptLimit: AI_PROMPT_LIMIT_LONG,
  },
} as const satisfies Record<string, GeneratorSpec>;
type Generator = keyof typeof GENERATORS;

function isGenerator(value: unknown): value is Generator {
  return typeof value === "string" && Object.hasOwn(GENERATORS, value);
}

// Constraints are the panel's structured fields rendered as lines ("Level: 3"),
// and for the fill generators (room, quest beat, calendar event) the campaign
// context the fill is grounded in: the site and its neighbouring rooms, the
// beats either side, the pantheon. That is the DM's own data going into the
// DM's own generation, but it is still bounded so the body cannot smuggle a
// second prompt past the limit.
const MAX_CONSTRAINTS = 12;
const MAX_CONSTRAINT_CHARS = 400;


serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const generatorNames = Object.keys(GENERATORS).join("|");
  const invalidBody = () => jsonError(400, "invalid_body", `Need { campaign_id, generator: ${generatorNames}, prompt, constraints? }.`);
  if (!body || typeof body.campaign_id !== "string" || typeof body.prompt !== "string") return invalidBody();
  if (!isGenerator(body.generator)) return invalidBody();
  const rawConstraints: unknown = body.constraints ?? [];
  if (
    !Array.isArray(rawConstraints) ||
    rawConstraints.length > MAX_CONSTRAINTS ||
    !rawConstraints.every((c) => typeof c === "string" && c.length <= MAX_CONSTRAINT_CHARS)
  ) return invalidBody();
  const campaign_id = body.campaign_id;
  const prompt = body.prompt;
  const generator = body.generator;
  const constraints = rawConstraints as string[];

  const spec: GeneratorSpec = GENERATORS[generator];
  const { promptKey, reason } = spec;
  const format = spec.format ?? "json";

  const promptCheck = validatePromptInput(prompt, spec.promptLimit ?? AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: the request runs on the campaign's setting prompt and credits. No player surface calls
  // this (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<EntityCampaign>(admin, campaign_id, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  if (spec.fiveE && !gameSystemEdition(campaign.game_system)) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [promptKey, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === promptKey);
  // A missing ruleset row is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", `The ${generator} prompt is not configured.`);

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  // The platform picks the model: the provider the admin enabled.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const cost = wholeCredits(
    applyMultiplier(
      await fetchCreditCost(admin, reason),
      text.textMultiplier,
    ),
  );

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content
    + (spec.extraInstructions ?? "")
    + (rulesetContext ? `\n\n${rulesetContext}` : "")
    + worldBlockText(world)
    + INJECTION_GUARD_SUFFIX;
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length
    ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
    : wrappedPrompt;

  return withCreditHold(admin, { payerId: user.id, reason, cost, report }, async (hold) => {
    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        outputFormat: format,
      });
    } catch (e) {
      console.error(`${generator} text generation failed:`, e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const unreadable = () =>
      jsonError(502, "generation_failed", "The model returned an unreadable answer. Nothing was charged; please try again.");
    let data: unknown;
    try {
      data = format === "text" ? { content: textResult.content.trim() } : JSON.parse(textResult.content);
    } catch {
      // Nothing usable came back, so nothing is charged.
      console.error(`${generator} generation returned unparseable JSON`);
      return unreadable();
    }
    const empty = format === "text" && !textResult.content.trim();
    if (empty || typeof data !== "object" || data === null || Array.isArray(data)) return unreadable();

    hold.charge(reason, {
      cost,
      log: {
        model: textResult.usage.model,
        provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens,
        output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: reason,
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    // A generated spell's condition is vetted against its own text before it reaches the client (#1021). A safety
    // step: if it throws, the hold writes the charge as a free line and the user is not charged for the error.
    const answer = generator === "spell" ? vetGeneratedSpell(data as Record<string, unknown>) : data;

    return json({ ...answer, ai_provenance });
  });
}));
