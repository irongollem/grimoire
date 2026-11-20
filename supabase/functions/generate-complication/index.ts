import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { gameSystemEdition, NO_RULES_SYSTEM_MESSAGE, rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_SHORT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
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
import { repairGeneratedNames } from "../_shared/nameRepairWire.ts";
import { repaired } from "../_shared/nameRepair.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { formatSnapshot, parseSnapshot } from "./snapshot.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

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

interface ComplicationCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined;
  if (!body || !campaign_id || !isMode(body.mode)) return jsonError(400, "invalid_body", "Need { campaign_id, mode }.");
  const mode = body.mode;
  // The steer is OPTIONAL here, unlike every other generator in this repo.
  // Mid-fight the DM often wants "just give me something" with both hands on
  // the initiative tracker; the encounter snapshot below is already a richer
  // prompt than most generators get from typed input.
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const snapshot = parseSnapshot(body.snapshot);

  // _SHORT (500): this is a one-line steer typed mid-combat, not a composed
  // multi-field prompt. Empty passes — validatePromptInput is only reached
  // when the DM actually typed something.
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  // DMs only: this reads DM-only campaign content with the service role (see
  // _shared/campaignAccess.ts for why a player member must not get through).
  const load = await loadAiCampaign<ComplicationCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system.
  // 5e-shaped output with no meaning in a Generic campaign (#934): the client
  // hides the button, this is the server-side backstop. No edition, no fallback.
  const ruleset = gameSystemEdition(campaign.game_system);
  if (!ruleset) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const promptType = PROMPT_ROW[mode];
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [promptType, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === promptType);
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
  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  // The platform picks the model: a campaign on credits runs on the provider the
  // admin enabled, and campaigns.text_provider only counts with the campaign's own key.
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, "complication_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

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
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // What the retrieval query is ABOUT: the DM's steer when they typed one,
  // otherwise the fight itself. Embedding an empty string would return an
  // arbitrary corner of the corpus, so the snapshot is the fallback query
  // rather than merely extra context.
  const retrievalQuery = prompt.trim() ||
    [snapshot.name, ...(snapshot.combatants ?? []).slice(0, 10).map((c) => c.name)]
      .filter(Boolean).join(", ") ||
    "a mid-combat complication";

  // An empty steer is normal here (see the body parse), so the user content
  // may be snapshot + candidates alone. wrapUserInput is applied only to text
  // the DM actually typed — wrapping an empty string would tell the model it
  // was handed an empty instruction. Built before the hold: the snapshot is
  // client-controlled, so nothing that reads it may sit where a throw strands a reservation.
  const steer = prompt.trim() ? wrapUserInput(prompt.trim()) : "";
  const snapshotBlock = formatSnapshot(snapshot);

  return withCreditHold(admin, { payerId: user.id, reason: "complication_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#595 bestiary + #600 entities) ───────────────────
    // An ENHANCEMENT, never a requirement. Both corpora are retrieved from ONE
    // embedding of the same query text, and the whole block is one try/catch:
    // a partially-grounded proposal (real NPCs, hallucinated creatures) is a
    // worse failure than an ungrounded one, because unresolvable creature names
    // put nothing on the board and the DM only finds out at the preview.
    let entities: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] } =
      { npcs: [], locations: [], factions: [] };
    let monsters: CandidateMonster[] = [];

    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQuery]);

      // Queued HERE, not after the RPCs below — real provider spend was
      // incurred the moment embed() returned, and everything after this point
      // can throw into the catch. Platform-paid, charged to nobody.
      hold.free("entity_embedding", {
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
    const userContent = `${steer}${snapshotBlock}${entityBlock}${monsterBlock}`;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        // One short object: a name, a few sentences of narration, and at most a
        // handful of reinforcement entries. Far smaller than a quest batch or a
        // 1d100 table, and mid-combat latency matters more here than headroom.
        maxTokens: 900,
      });
    } catch (e) {
      console.error("Complication text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The complication came back unreadable. Nothing was charged; please try again.");
    let data: ComplicationAiResult;
    try {
      data = JSON.parse(textResult.content) as ComplicationAiResult;
    } catch {
      return malformed();
    }
    // Narration is the one field with no useful fallback: an event the DM cannot
    // read out is not a complication. Everything else is optional by design and
    // is normalised client-side. A reply of `null` parses fine and has no narration either.
    if (!data || typeof data.narration !== "string" || !data.narration.trim()) return malformed();

    // Charged the moment the paid call has produced a usable result (delta 0 on BYOK).
    hold.charge("complication_generation", {
      cost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // A near miss in a reinforcement's name is put to a judgment model against exactly the creatures and NPCs
    // the prompt offered (the two lists the client resolves a reinforcement against) and rewritten to the
    // offered name when it is confident (#1061). Free to the user; off until a typesafe key exists.
    // A polish step: if it fails the proposal goes out unrepaired rather than a paid result turning into a 500.
    if (Array.isArray(data.reinforcements)) {
      try {
        const reinforcements = data.reinforcements;
        const [reinforcementRepairs] = await repairGeneratedNames(admin, user.id, [{
          names: reinforcements
            .filter((r) => typeof r?.name === "string")
            .map((r) => ({ name: r.name, note: typeof r.role === "string" ? r.role : undefined })),
          offered: [
            ...monsters.map((c) => ({ name: c.name, hint: `CR ${c.cr} ${c.type}` })),
            ...entities.npcs.map((c) => (c.descriptor ? { name: c.name, hint: c.descriptor } : { name: c.name })),
          ],
          context: "Reinforcements joining a D&D combat encounter. Each is a creature or a person.",
        }]);
        data = {
          ...data,
          reinforcements: reinforcements.map((r) =>
            typeof r?.name === "string" ? { ...r, name: repaired(reinforcementRepairs, r.name) } : r),
        };
      } catch (e) {
        console.warn("Complication name repair failed; returning the proposal unrepaired:", e);
      }
    }

    const ai_provenance: AiProvenance = {
      generatorType: "complication_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    // `grounded` tells the panel whether unresolvable creature names are the
    // model guessing (retrieval down / bestiary not embedded) or simply a
    // creature this campaign does not have.
    return json({ ...data, mode, grounded: monsters.length > 0, ai_provenance });
  });
}));
