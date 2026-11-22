import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  toPlainText,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { premiseEntryText, worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import {
  clueShape,
  forceShape,
  isLoreKind,
  loreShape,
  MAX_PREMISE_SUGGESTIONS,
  premiseShape,
  questionShape,
  sanitizeClues,
  sanitizeForces,
  sanitizeLore,
  sanitizePremise,
  sanitizeQuestions,
  sanitizeTruths,
  truthShape,
  type ForceQuestRef,
  type ForceWho,
  type KnowerCandidate,
  type LoreKind,
  type SpotCandidate,
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

interface CanonCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
}

type Mode = "premise" | "truths" | "clues" | "questions" | "forces" | "lore";

const MODES: Record<Mode, { promptRow: string; ledger: string }> = {
  premise: { promptRow: "canon_premise", ledger: "canon_premise_suggestion" },
  truths: { promptRow: "canon_truths", ledger: "canon_truth_suggestion" },
  clues: { promptRow: "canon_clues", ledger: "canon_clue_suggestion" },
  questions: { promptRow: "canon_questions", ledger: "canon_question_suggestion" },
  forces: { promptRow: "canon_forces", ledger: "canon_force_suggestion" },
  lore: { promptRow: "canon_lore", ledger: "canon_lore_suggestion" },
};

const isMode = (v: unknown): v is Mode => typeof v === "string" && Object.hasOwn(MODES, v);

const MAX_NPCS = 40;
const MAX_FACTIONS = 30;
const MAX_PCS = 20;
const MAX_LOCATIONS = 40;
const MAX_BEATS = 40;
const MAX_QUESTS = 30;
const MAX_TEXT_CHARS = 4000;

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

/** Rows of a canon part (title and body), DM-only, read with the campaign in the query. */
function canonTitles(db: SupabaseClient, campaignId: string, part: string) {
  return readRows<{ title: string }>(db.from("canon_entries").select("title").eq("campaign_id", campaignId).eq("part", part));
}

const listOfTitles = (rows: { title: string }[]): string[] => rows.map((r) => r.title.trim()).filter((t) => t !== "");

const bullets = (items: string[], none = "(none yet)"): string => (items.length > 0 ? items.map((t) => `- ${t}`).join("\n") : none);

/** Places, people and quest beats a clue or a lore passage may lie at. */
async function loadSpots(db: SupabaseClient, campaignId: string): Promise<{ spots: SpotCandidate[]; beatQuest: Map<string, string> }> {
  const [locations, npcs, beats] = await Promise.all([
    readRows<{ id: string; name: string }>(
      db.from("locations").select("id, name").eq("campaign_id", campaignId).order("updated_at", { ascending: false }).limit(MAX_LOCATIONS),
    ),
    readRows<{ id: string; name: string }>(
      db.from("npcs").select("id, name").eq("campaign_id", campaignId).order("updated_at", { ascending: false }).limit(MAX_NPCS),
    ),
    // The constraint is named: a bare `quests(...)` embed is ambiguous since #871.
    readRows<{ id: string; title: string; quests: { title: string }[] | { title: string } | null }>(
      db.from("quest_beats").select("id, title, quests:quests!quest_beats_quest_campaign_fkey(title)")
        .eq("campaign_id", campaignId).order("title", { ascending: true }).limit(MAX_BEATS),
    ),
  ]);
  const beatQuest = new Map<string, string>();
  // A many-to-one embed arrives as one object; the client's inferred type calls it a list.
  for (const b of beats) {
    const quest = Array.isArray(b.quests) ? b.quests[0] : b.quests;
    if (quest) beatQuest.set(b.id, quest.title);
  }
  return {
    spots: [
      ...locations.map((r) => ({ kind: "location" as const, id: r.id, name: r.name })),
      ...npcs.map((r) => ({ kind: "npc" as const, id: r.id, name: r.name })),
      ...beats.map((r) => ({ kind: "quest_beat" as const, id: r.id, name: r.title })),
    ],
    beatQuest,
  };
}

function spotLines(spots: SpotCandidate[], beatQuest: Map<string, string>): string {
  if (spots.length === 0) return "(nowhere yet)";
  return spots.map((s) => {
    const quest = s.kind === "quest_beat" ? beatQuest.get(s.id) : undefined;
    return `${s.kind}|${s.name}${quest ? `|in quest: ${quest}` : ""}`;
  }).join("\n");
}


serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate, including BYOK (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const invalidBody = (why: string) => jsonError(400, "invalid_body", why);
  if (!body || typeof body.campaign_id !== "string" || !body.campaign_id || !isMode(body.mode)) {
    return invalidBody(`Need { campaign_id, mode: ${Object.keys(MODES).join(" | ")} }.`);
  }
  const campaign_id = body.campaign_id;
  const mode = body.mode;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const secretId = typeof body.secret_id === "string" ? body.secret_id : "";
  const loreTitle = typeof body.title === "string" ? body.title.trim() : "";
  const loreKind: LoreKind | null = isLoreKind(body.lore_kind) ? body.lore_kind : null;
  const loreText = typeof body.text === "string" ? body.text.trim() : "";
  if (mode === "clues" && secretId === "") return invalidBody("A secret_id is required.");
  if (mode === "lore" && loreTitle === "") return invalidBody("A title is required.");
  for (const field of [loreTitle, loreText]) {
    if (field !== "" && field.length > MAX_TEXT_CHARS) return invalidBody("Text too long.");
  }
  // The pitch is the whole input of "Draft from a pitch"; the truths helper takes an optional steer.
  if (mode === "premise" && prompt === "") return invalidBody("A pitch is required.");
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  // DMs only: the helper reads every truth, including secrets, with the service role, and a player must not
  // be able to ask the model to echo them.
  const load = await loadAiCampaign<CanonCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const { promptRow: PROMPT_ROW, ledger: LEDGER_REASON } = MODES[mode];
  const rulesetKey = rulesetContextKey(campaign.game_system);
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext = promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  // The owner's BYOK keys live in campaign_api_keys (#1228), Pro-only, checked by the loader at use time.
  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(applyMultiplier(baseCost, text.textMultiplier));

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: LEDGER_REASON, cost, report }, async (hold) => {
    // The prompt below is built from reads that can fail; that is the one failure this function answers itself (502),
    // as it always has. The hold is released whatever happens.
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
        const existing = rows.map((r) => ({ kind: r.premise_kind, text: premiseEntryText(r.premise_kind, r.title, r.body) }))
          .filter((r) => r.text !== "");
        system = base(premiseShape());
        user_ = `${steer}The DM's pitch is above. Entries the campaign already has (do not repeat them):\n` +
          (existing.length > 0 ? existing.map((e) => `- ${e.kind}: ${e.text}`).join("\n") : "(none yet)");
        sanitize = (parsed) => {
          const result = sanitizePremise(parsed, existing);
          const hasPitch = existing.some((entry) => entry.kind === "pitch");
          const proposedPitch = result.suggestions.some((entry) => entry.kind === "pitch");
          // The DM's own first pitch is canonical input, not a model-dependent optional suggestion.
          if (!hasPitch && !proposedPitch) {
            if (result.suggestions.length >= MAX_PREMISE_SUGGESTIONS) result.suggestions.pop();
            result.suggestions.unshift({ kind: "pitch", text: prompt });
          }
          return result;
        };
      } else if (mode === "clues") {
        const [secrets, clues, found] = await Promise.all([
          readRows<{ title: string; body: string | null }>(
            admin.from("canon_entries").select("title, body").eq("campaign_id", campaign.id).eq("part", "secret").eq("id", secretId),
          ),
          readRows<{ title: string; location_id: string | null; npc_id: string | null; quest_beat_id: string | null; passage_id: string | null }>(
            admin.from("canon_clues").select("title, location_id, npc_id, quest_beat_id, passage_id")
              .eq("campaign_id", campaign.id).eq("secret_id", secretId),
          ),
          loadSpots(admin, campaign.id),
        ]);
        const secret = secrets[0];
        if (!secret) return jsonError(404, "secret_not_found", "Secret not found.");
        const used = new Set<string>();
        for (const c of clues) {
          if (c.location_id) used.add(`location|${c.location_id}`);
          if (c.npc_id) used.add(`npc|${c.npc_id}`);
          if (c.quest_beat_id) used.add(`quest_beat|${c.quest_beat_id}`);
        }
        const free = found.spots.filter((s) => !used.has(`${s.kind}|${s.id}`));
        const where = (c: (typeof clues)[number]) => {
          const hit = found.spots.find((s) =>
            (s.kind === "location" && s.id === c.location_id) || (s.kind === "npc" && s.id === c.npc_id) ||
            (s.kind === "quest_beat" && s.id === c.quest_beat_id));
          return hit ? `${hit.kind} ${hit.name}` : c.passage_id ? "a lore passage" : "somewhere";
        };
        const statement = [secret.title.trim(), toPlainText(secret.body).trim()].filter((t) => t !== "").join("\n");
        system = base(clueShape());
        user_ = `${steer}The secret the clues point to (a clue hints at it and never states it):\n${wrapUserInput(statement)}\n\n` +
          `Clues already placed to this secret (do not repeat them):\n${bullets(clues.map((c) => `${c.title.trim()} (at ${where(c)})`))}\n\n` +
          "Places, people and quest beats a clue may lie at. Every 'at' must be copied exactly from one of these lines:\n" +
          `---BEGIN SPOTS---\n${spotLines(free, found.beatQuest)}\n---END SPOTS---`;
        sanitize = (parsed) => sanitizeClues(parsed, free, used);
      } else if (mode === "questions") {
        const [truths, secrets, questions] = await Promise.all([
          readRows<{ title: string; knowledge: string | null }>(
            admin.from("canon_entries").select("title, knowledge").eq("campaign_id", campaign.id).eq("part", "truth"),
          ),
          canonTitles(admin, campaign.id, "secret"),
          canonTitles(admin, campaign.id, "question"),
        ]);
        const asked = listOfTitles(questions);
        system = base(questionShape());
        user_ = `${steer}Truths the campaign holds (a question they answer is not open):\n${bullets(listOfTitles(truths))}\n\n` +
          `Secrets the campaign holds (a question they answer is not open):\n${bullets(listOfTitles(secrets))}\n\n` +
          `Questions the campaign already keeps open (do not repeat them):\n${bullets(asked)}`;
        sanitize = (parsed) => sanitizeQuestions(parsed, asked);
      } else if (mode === "forces") {
        const [forces, factions, npcs, quests] = await Promise.all([
          canonTitles(admin, campaign.id, "force"),
          readRows<{ id: string; name: string }>(
            admin.from("factions").select("id, name").eq("campaign_id", campaign.id).order("updated_at", { ascending: false }).limit(MAX_FACTIONS),
          ),
          readRows<{ id: string; name: string }>(
            admin.from("npcs").select("id, name").eq("campaign_id", campaign.id).order("updated_at", { ascending: false }).limit(MAX_NPCS),
          ),
          readRows<{ id: string; title: string }>(
            admin.from("quests").select("id, title").eq("campaign_id", campaign.id).order("updated_at", { ascending: false }).limit(MAX_QUESTS),
          ),
        ]);
        const whos: ForceWho[] = [
          ...factions.map((r) => ({ kind: "faction" as const, id: r.id, name: r.name })),
          ...npcs.map((r) => ({ kind: "npc" as const, id: r.id, name: r.name })),
        ];
        const questRefs: ForceQuestRef[] = quests.map((r) => ({ id: r.id, title: r.title }));
        const existing = listOfTitles(forces);
        system = base(forceShape());
        user_ = `${steer}Forces the campaign already has (do not repeat them):\n${bullets(existing)}\n\n` +
          "Factions and people a force may be. If the canon or the DM's steer gives a listed faction its own active agenda, include it as a separate force and set who to that exact listed name so it links to the campaign record. Use free text only when no listed person or faction fits.\n---BEGIN WHO---\n" +
          (whos.length > 0 ? whos.map((w) => `${w.kind}|${w.name}`).join("\n") : "(nobody yet)") + "\n---END WHO---\n\n" +
          "Quests where the party may meet a force. Every quest must be copied exactly from one of these lines:\n---BEGIN QUESTS---\n" +
          (questRefs.length > 0 ? questRefs.map((q) => q.title).join("\n") : "(no quests yet: name none)") + "\n---END QUESTS---";
        sanitize = (parsed) => sanitizeForces(parsed, whos, questRefs, existing);
      } else if (mode === "lore") {
        const [lore, questions, found] = await Promise.all([
          canonTitles(admin, campaign.id, "lore"),
          canonTitles(admin, campaign.id, "question"),
          loadSpots(admin, campaign.id),
        ]);
        const existing = listOfTitles(lore);
        system = base(loreShape());
        user_ = `${steer}The title of the lore entry: ${wrapUserInput(loreTitle)}\n` +
          `Its kind: ${loreKind ?? "(the DM did not say: choose one)"}\n` +
          (loreText !== "" ? `The text the DM already wrote (split and deepen it):\n${wrapUserInput(loreText)}\n` : "") +
          `\nLore the campaign already has (do not repeat it):\n${bullets(existing)}\n\n` +
          `Questions the campaign keeps open on purpose (never answer one):\n${bullets(listOfTitles(questions))}\n\n` +
          "Places, people and quest beats a later passage may come out at. Every 'at' must be copied exactly from one of these lines:\n" +
          `---BEGIN SPOTS---\n${spotLines(found.spots, found.beatQuest)}\n---END SPOTS---`;
        sanitize = (parsed) => sanitizeLore(parsed, found.spots, existing, { title: loreTitle, kind: loreKind });
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
        const maxTokens = mode === "premise" || mode === "forces" ? 5000 : mode === "lore" ? 4000 : 2500;
        textResult = await callText({ text, model: text.config?.text_model, system, user: user_, maxTokens });
      } catch (e) {
        console.error("Canon suggestion text generation failed:", e);
        return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textResult.content);
      } catch {
        return jsonError(502, "generation_failed", "The AI returned malformed suggestions. Nothing was charged; please try again.");
      }

      const { suggestions, setAside } = sanitize(parsed);
      if (suggestions.length === 0 && setAside.length === 0) {
        return jsonError(502, "generation_failed", "No usable suggestions. Nothing was charged; please try again.");
      }

      // Nothing the DM can accept is not a generation they pay for: show why, charge nothing (no `hold.charge`).
      if (suggestions.length === 0) return json({ suggestions, setAside, ai_provenance: null });
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
      return json({ suggestions, setAside, ai_provenance });
    } catch (e) {
      console.error("Canon suggestion failed:", e);
      return jsonError(502, "generation_failed", "Could not build suggestions. Nothing was charged; please try again.");
    }
  });
}));
