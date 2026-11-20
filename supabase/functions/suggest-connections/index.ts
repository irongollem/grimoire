import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
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
import { retrieveCampaignEntities, type CandidateEntity } from "../_shared/campaignEntityRetrieval.ts";
import {
  SUGGESTED_FACTION_ROLES,
  SUGGESTED_KIN_RELATIONS,
  sanitizeSuggestions,
  typeGuide,
  withTargetIds,
} from "../_shared/connectionSuggestions.ts";
import { LINK_KINDS, PERSON_KINDS, type LinkKind } from "../_shared/worldLinkCatalogue.ts";
import { campaignToday } from "../_shared/npcAge.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { gatherConnections, loadSubject, retrievalQueryFor } from "./gather.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

/**
 * Connection suggester (#910, widened to the whole World Web by #1084).
 *
 * Proposes ties between one thing (an NPC, a character, a faction, a place, a
 * deity or an item) and the rest of the campaign. NOTHING IS WRITTEN HERE: the
 * response is a list of proposals the DM accepts or dismisses one by one in the
 * client, which writes each through `useCreateConnection`.
 *
 * Candidates come from two places on purpose. Semantic retrieval ranks the
 * campaign's NPCs, places and factions against the subject, but it is an
 * enhancement that can be down or empty (nothing embedded yet), so a bounded
 * direct read of every kind the subject can be tied to always rides along
 * (`gather.ts`). The model may only name candidates and only types the
 * catalogue holds for the pair; `sanitizeSuggestions` drops everything else.
 *
 * Server-path only, like generate-complication: the candidate blocks come from
 * service-role reads the browser cannot make.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface ConnectionCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
  current_year: number | null;
  current_month: number | null;
  current_day: number | null;
}

/** The prompt row holds the editorial rules; the output shape below is code, so it cannot drift from the check. */
const PROMPT_ROW = "connections";
/** The ledger and price row keep their first name: renaming would split the admin's calibration history in two. */
const LEDGER_REASON = "npc_relationship_suggestion";

function outputShape(subject: LinkKind): string {
  const person = PERSON_KINDS.includes(subject);
  const shapes = [
    `{"kind":"link","target_kind":"${LINK_KINDS.join("|")}","target_name":"copied exactly from the candidates","type":"a type key from the list for that kind","subject_is_from":true or false as the list gives it,"notes":"one or two sentences: how and why, and a hook for the table"}`,
  ];
  if (person || subject === "faction") {
    shapes.push(
      `{"kind":"membership","target_kind":"${subject === "faction" ? "npc|party_member" : "faction"}","target_name":"copied exactly","role":"one of: ${SUGGESTED_FACTION_ROLES.join(", ")}","notes":"..."}`,
    );
  }
  if (person) {
    shapes.push(
      `{"kind":"kin","target_name":"copied exactly","target_type":"npc|pc","relation":"what the TARGET is to the subject; one of: ${SUGGESTED_KIN_RELATIONS.join(", ")}","parent_role":"father|mother|null","notes":"the evidence"}`,
    );
  }
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion one of these shapes:\n${shapes.join("\n")}\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}


serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate, including BYOK (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const subject_kind = LINK_KINDS.find((k) => k === body?.subject_kind);
  if (
    !body || typeof body.campaign_id !== "string" || !body.campaign_id ||
    typeof body.subject_id !== "string" || !body.subject_id || !subject_kind
  ) {
    return jsonError(400, "invalid_body", "Need { campaign_id, subject_kind, subject_id }.");
  }
  const campaign_id = body.campaign_id;
  const subject_id = body.subject_id;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";

  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  // DMs only, not every member: this reads backstories and DM-only ties
  // with the service role, and its notes would carry those secrets to a player.
  const load = await loadAiCampaign<ConnectionCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system", "current_year", "current_month", "current_day"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  // The subject, scoped to the campaign the caller was just authorised for.
  let subject: Awaited<ReturnType<typeof loadSubject>>;
  try {
    subject = await loadSubject(admin, campaign, subject_kind, subject_id);
  } catch (e) {
    console.error("Connection suggestion could not read its subject:", e);
    return jsonError(502, "subject_read_failed", "Could not read that record. Please try again.");
  }
  if (!subject) return jsonError(404, "subject_not_found", "Not found in this campaign.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + outputShape(subject_kind) +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

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

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Gate before any paid provider work, retrieval's embedding included (#466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: LEDGER_REASON, cost, report }, async (hold) => {
    // The candidate reads below can throw; that is the one failure this function answers itself (502), as it always
    // has. The hold is released whatever happens.
    try {
      // ── Candidates: retrieval first, then the direct reads as the floor ──────
      let retrieved: { npcs: CandidateEntity[]; factions: CandidateEntity[]; locations: CandidateEntity[] } =
        { npcs: [], factions: [], locations: [] };
      try {
        const embedProvider = await resolveEmbeddingProvider(admin, {
          openai: platformKeys.openai ?? null,
          gemini: platformKeys.gemini ?? null,
        });
        const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQueryFor(subject, prompt)]);
        // Recorded as soon as embed() returns: the spend is real even if a later
        // step throws. Platform-paid, charged to nobody.
        hold.free("entity_embedding", {
          model:        embedProvider.model,
          provider:     embedUsage.provider,
          input_tokens: embedUsage.input_tokens,
        });
        const found = await retrieveCampaignEntities(admin, {
          queryVector:    toVectorLiteral(vectors[0]),
          campaignId:     campaign_id,
          ownerId:        campaign.user_id,
          embeddingModel: embedProvider.model,
        });
        retrieved = { npcs: found.npcs, factions: found.factions, locations: found.locations };
      } catch (e) {
        const why = e instanceof EmbeddingProviderConfigError
          ? `embedding provider not usable (${e.message})`
          : e instanceof Error ? e.message : "unknown error";
        console.warn(`Connection retrieval unavailable for campaign ${campaign_id}, using direct candidates only: ${why}`);
      }
      const grounded = retrieved.npcs.length + retrieved.factions.length + retrieved.locations.length > 0;

      const gathered = await gatherConnections(admin, {
        campaignId: campaign_id,
        subject,
        today: campaignToday(campaign),
        retrieved,
      });

      if (gathered.candidateCount === 0) {
        return jsonError(422, "nothing_to_connect", "There is nothing else in this campaign to connect this to yet.");
      }

      // ── Prompt ────────────────────────────────────────────────────────────────
      const steer = prompt.trim() ? `${wrapUserInput(prompt.trim())}\n\n` : "";
      const userContent =
        `${steer}The subject to connect:\n---BEGIN SUBJECT---\n${gathered.subjectLines.join("\n")}\n---END SUBJECT---` +
        (gathered.existingLines.length > 0
          ? `\n\nTies the subject already has, read from its side (do not repeat them):\n${gathered.existingLines.join("\n")}`
          : "") +
        `\n\nTypes of link the subject can hold, by the kind of the other end (use the key; subject_is_from says which end the subject is):\n${typeGuide(subject_kind)}` +
        "\n\nCandidates. Every target_name must be copied exactly from one of these lines " +
        "(kind|name|what it is|where they are, offices held, who heads it, who carries it or who holds it; pc lines carry a name and birth year only); " +
        "the app resolves them back to real records by name.\n" +
        "---BEGIN CANDIDATES---\n" +
        gathered.candidateLines.join("\n") +
        "\n---END CANDIDATES---";

      const textModel = text.config?.text_model;

      let textResult: TextResult;
      try {
        textResult = await callText({
          text,
          model: textModel,
          system: systemContent,
          user: userContent,
          maxTokens: 3500,
        });
      } catch (e) {
        console.error("Connection suggestion text generation failed:", e);
        return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textResult.content);
      } catch {
        return jsonError(502, "generation_failed", "The AI returned malformed suggestions. Nothing was charged; please try again.");
      }

      const sanitized = sanitizeSuggestions(parsed, gathered.context);
      const { setAside } = sanitized;
      // The client writes by id, so each suggestion carries the id of the candidate its name resolved to.
      const suggestions = withTargetIds(sanitized.suggestions, gathered.ids);
      // A set-aside claim is still worth showing: it tells the DM why nothing was offered.
      if (suggestions.length === 0 && setAside.length === 0) {
        return jsonError(502, "generation_failed", "No usable suggestions. Nothing was charged; please try again.");
      }

      // Nothing the DM can accept is not a generation they pay for: show why, charge nothing (no `hold.charge`).
      if (suggestions.length === 0) return json({ suggestions, setAside, grounded, ai_provenance: null });
      hold.charge(LEDGER_REASON, {
        cost,
        isByok: text.isByok,
        log: {
          model: textResult.usage.model, provider: textResult.usage.provider,
          input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
        },
      });

      const ai_provenance: AiProvenance = {
        generatorType: LEDGER_REASON,
        provider: textResult.usage.provider,
        model: textResult.usage.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };

      return json({ suggestions, setAside, grounded, ai_provenance });
    } catch (e) {
      console.error("Connection suggestion failed:", e);
      return jsonError(502, "generation_failed", "Could not build suggestions. Nothing was charged; please try again.");
    }
  });
}));
