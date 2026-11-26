import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { gameSystemEdition, rulesetContextKey } from "../_shared/gameSystem.ts";
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
import { collectMentions, loadMentionNames } from "../_shared/mentionNames.ts";
import { premiseEntryText, worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import {
  clueShape,
  forceShape,
  arcShape,
  backstoryShape,
  isLoreKind,
  loreShape,
  MAX_PREMISE_SUGGESTIONS,
  peopleShape,
  premiseShape,
  questionShape,
  readPremiseKinds,
  sanitizeArcs,
  sanitizeBackstory,
  sanitizeClues,
  sanitizeForces,
  sanitizeLore,
  sanitizePeoples,
  sanitizePremise,
  sanitizeQuestions,
  sanitizeSecrets,
  sanitizeTruths,
  secretShape,
  truthShape,
  type ForceQuestRef,
  type ForceWho,
  type KnowerCandidate,
  type ListedPeople,
  type LoreKind,
  type PeopleCandidate,
  type SpotCandidate,
  type ThemeCandidate,
} from "../_shared/canonSuggestions.ts";
import { canonDigestLines, DIGEST_MAX_ENTRIES } from "../_shared/canonDigest.ts";
import { looseEndFindings, readShape, sanitizeContradictions, type ReadFinding } from "../_shared/canonReadThrough.ts";
import type { LooseClue, LooseEntry } from "../_shared/canonLooseEnds.ts";

/**
 * Canon helpers (#1226 story 2, frame 13): "Draft from a pitch" proposes premise entries, "Suggest truths" proposes
 * truths with who knows them. NOTHING IS WRITTEN HERE: the reply is a list the DM accepts or dismisses one by one in
 * the client, which writes each (and a truth's `known_to` ties) itself. "Suggest secrets" (`secrets`) proposes a secret
 * with up to three clues placed by id; "Read it through" (`read`) returns findings (contradictions from the model,
 * loose ends from code) and is a mode here, not a function of its own, because it needs everything this does: the DM
 * gate, the prompt row, the price, the hold and the grounding of ids. Its findings write nothing either.
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
  game_system: string | null;
  disabled_species_ids: string[] | null;
}

interface BackstoryMember {
  name: string;
  class: string | null;
  subclass: string | null;
  subrace: string | null;
  level: number | null;
  species_id: string | null;
  player_description: string | null;
}

type Mode = "premise" | "truths" | "clues" | "questions" | "forces" | "lore" | "secrets" | "read" | "arcs" | "peoples" | "backstory";

const MODES: Record<Mode, { promptRow: string; ledger: string }> = {
  premise: { promptRow: "canon_premise", ledger: "canon_premise_suggestion" },
  truths: { promptRow: "canon_truths", ledger: "canon_truth_suggestion" },
  clues: { promptRow: "canon_clues", ledger: "canon_clue_suggestion" },
  questions: { promptRow: "canon_questions", ledger: "canon_question_suggestion" },
  forces: { promptRow: "canon_forces", ledger: "canon_force_suggestion" },
  lore: { promptRow: "canon_lore", ledger: "canon_lore_suggestion" },
  secrets: { promptRow: "canon_secrets", ledger: "canon_secret_suggestion" },
  arcs: { promptRow: "canon_arcs", ledger: "canon_arc_suggestion" },
  peoples: { promptRow: "canon_peoples", ledger: "canon_people_suggestion" },
  backstory: { promptRow: "canon_backstory", ledger: "canon_backstory_suggestion" },
  // "Read it through" is priced as its own row: it reads the whole canon, so it is not a suggester's price.
  read: { promptRow: "canon_read_through", ledger: "canon_read_through" },
};

const isMode = (v: unknown): v is Mode => typeof v === "string" && Object.hasOwn(MODES, v);

const MAX_NPCS = 40;
const MAX_FACTIONS = 30;
const MAX_PCS = 20;
const MAX_LOCATIONS = 40;
const MAX_BEATS = 40;
const MAX_QUESTS = 30;
const MAX_TEXT_CHARS = 4000;
/** "Read it through" lists this many entries to the model, each with this much of its text. */
const MAX_READ_ENTRIES = 150;
const READ_EXCERPT_CHARS = 300;
const MAX_ARCS = 30;
const MAX_THEMES = 20;
const MAX_LIBRARY_SPECIES = 150;
const MAX_CUSTOM_SPECIES = 60;
const MAX_PASSAGES = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Titles of a canon part, DM-only, read with the campaign in the query. Only entries still open: an answered question
 * is no longer kept open and an ended force no longer moves, so neither is offered as one (#1255). The other parts
 * never close, so the filter leaves them whole.
 */
function canonTitles(db: SupabaseClient, campaignId: string, part: string) {
  return readRows<{ title: string }>(db.from("canon_entries").select("title").eq("campaign_id", campaignId).eq("part", part).is("closed_as", null));
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

/** Like `spotLines`, with the id the model must copy: "secrets" places a clue by id. */
function spotLinesWithIds(spots: SpotCandidate[], beatQuest: Map<string, string>): string {
  if (spots.length === 0) return "(nowhere yet)";
  return spots.map((s) => {
    const quest = s.kind === "quest_beat" ? beatQuest.get(s.id) : undefined;
    return `${s.kind}|${s.id}|${s.name}${quest ? `|in quest: ${quest}` : ""}`;
  }).join("\n");
}

/**
 * What a walk draft asks for besides its section (#1282): range, so a DM who wrote little still has real choices. The
 * caps are each mode's own (`MAX_*` in canonSuggestions.ts); the model is told to fill them.
 */
const WALK_RANGE = "Your first job is to convert what the DM told you: every concrete fact, name or idea in their words becomes its own proposal, developed into a full entry but keeping its meaning, before anything of your own. " +
  "Then fill the rest with new proposals, each a bolder, more inventive step, still consistent with everything above, so there are at least five where the format allows more than one (three versions for a pitch, voice or look: the first closest to the DM's words). " +
  "The DM keeps only what they like.";

/** The canon beyond its premise, as the digest lines every helper reads (`_shared/canonDigest.ts`). */
async function loadCanonDigest(db: SupabaseClient, campaignId: string): Promise<string[]> {
  const [rows, arcs] = await Promise.all([
    readRows<{ part: string; title: string; body: string | null; closed_as: string | null }>(
      db.from("canon_entries").select("part, title, body, closed_as").eq("campaign_id", campaignId).neq("part", "premise")
        .order("part", { ascending: true }).order("sort_order", { ascending: true }).limit(DIGEST_MAX_ENTRIES * 2),
    ),
    readRows<{ name: string; question: string | null; status: string }>(
      db.from("canon_arcs").select("name, question, status").eq("campaign_id", campaignId).order("sort_order", { ascending: true }).limit(MAX_ARCS),
    ),
  ]);
  const nameOf = await loadMentionNames(db, campaignId, rows.flatMap((r) => collectMentions(r.body)));
  return canonDigestLines(rows.map((r) => ({ part: r.part, title: r.title, text: toPlainText(r.body, nameOf), closed: r.closed_as !== null })), arcs);
}

/** The source books a campaign has switched on, plus the always-on bundle, as `source_document_key`s. */
async function enabledSourceKeys(db: SupabaseClient, campaignId: string): Promise<string[]> {
  const rows = await readRows<{ source_slug: string }>(db.from("campaign_enabled_sources").select("source_slug").eq("campaign_id", campaignId));
  return ["grimoire-bundled", ...rows.map((r) => r.source_slug)];
}

/** The species a campaign may use as a people: its own, and the shared books' it has switched on (opt-in per source). */
async function loadPeopleCandidates(db: SupabaseClient, campaign: CanonCampaign): Promise<PeopleCandidate[]> {
  const edition = gameSystemEdition(campaign.game_system);
  const sourceKeys = await enabledSourceKeys(db, campaign.id);
  let library = db.from("library_species").select("id, name").in("source_document_key", sourceKeys);
  if (edition) library = library.or(`ruleset.is.null,ruleset.eq.${edition}`);
  const [own, shared] = await Promise.all([
    readRows<{ id: string; name: string }>(db.from("species").select("id, name").eq("campaign_id", campaign.id).order("name", { ascending: true }).limit(MAX_CUSTOM_SPECIES)),
    readRows<{ id: string; name: string }>(library.order("name", { ascending: true }).limit(MAX_LIBRARY_SPECIES)),
  ]);
  const disabled = new Set(campaign.disabled_species_ids ?? []);
  return [
    ...own.map((r) => ({ kind: "species" as const, id: r.id, name: r.name })),
    ...shared.map((r) => ({ kind: "library_species" as const, id: r.id, name: r.name })),
  ].filter((c) => !disabled.has(c.id));
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
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
  const partyMemberId = typeof body.party_member_id === "string" ? body.party_member_id : "";
  const premiseKinds = readPremiseKinds(body.kinds);
  // Design it with me (#1282) asks for range: several proposals, from the DM's notes to bolder ones, to choose between.
  const walkDraft = body.walk === true;
  if (!premiseKinds.ok) return invalidBody("kinds must be a non-empty list of premise kinds.");
  if (mode === "backstory" && partyMemberId === "") return invalidBody("A party_member_id is required.");
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
    columns: ["game_system", "disabled_species_ids"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // A character of another campaign is not found, however well the id is spelt: asked before any credit is held.
  let backstoryMember: BackstoryMember | null = null;
  if (mode === "backstory") {
    const members = await readRows<BackstoryMember>(
      admin.from("party_members").select("name, class, subclass, subrace, level, species_id, player_description")
        .eq("campaign_id", campaign.id).eq("id", partyMemberId),
    );
    backstoryMember = members[0] ?? null;
    if (!backstoryMember) return jsonError(404, "party_member_not_found", "Character not found.");
  }

  const { promptRow: PROMPT_ROW, ledger: LEDGER_REASON } = MODES[mode];
  const rulesetKey = rulesetContextKey(campaign.game_system);
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext = promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  const baseCost = await fetchCreditCost(admin, LEDGER_REASON);
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
      // "Read it through" only: loose ends come from code, and a canon too small to hold a contradiction skips the model.
      let skipModelWith: ReadFinding[] | null = null;

      if (mode === "premise") {
        const rows = await readRows<{ premise_kind: string | null; title: string; body: string | null }>(
          admin.from("canon_entries").select("premise_kind, title, body").eq("campaign_id", campaign.id).eq("part", "premise"),
        );
        // A body's @mentions store no name; without theirs the list would offer the DM a duplicate of what they have.
        const nameOf = await loadMentionNames(admin, campaign.id, rows.flatMap((r) => collectMentions(r.body, { skipSecrets: true })));
        const existing = rows.map((r) => ({ kind: r.premise_kind, text: premiseEntryText(r.premise_kind, r.title, r.body, nameOf) }))
          .filter((r) => r.text !== "");
        const kinds = premiseKinds.kinds;
        system = base(premiseShape(kinds));
        const brief = kinds
          ? `The DM's words above are their notes for exactly these sections: ${kinds.join(", ")}. Develop them into the finished sections, fuller and more specific than the notes, from the pitch, the premise and the canon below. Write only those sections. Entries the campaign already has (do not repeat them):\n`
          : "The DM's pitch is above. Entries the campaign already has (do not repeat them):\n";
        user_ = `${steer}${brief}` +
          (existing.length > 0 ? existing.map((e) => `- ${e.kind}: ${e.text}`).join("\n") : "(none yet)");
        sanitize = (parsed) => {
          const result = sanitizePremise(parsed, existing, kinds);
          const hasPitch = existing.some((entry) => entry.kind === "pitch");
          const proposedPitch = result.suggestions.some((entry) => entry.kind === "pitch");
          // The DM's own first pitch is canonical input, not a model-dependent optional suggestion.
          if (!hasPitch && !proposedPitch && (kinds === null || kinds.includes("pitch"))) {
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
        const secretNames = await loadMentionNames(admin, campaign.id, collectMentions(secret.body));
        const statement = [secret.title.trim(), toPlainText(secret.body, secretNames).trim()].filter((t) => t !== "").join("\n");
        system = base(clueShape());
        user_ = `${steer}The secret the clues point to (a clue hints at it and never states it):\n${wrapUserInput(statement)}\n\n` +
          `Clues already placed to this secret (do not repeat them):\n${bullets(clues.map((c) => `${c.title.trim()} (at ${where(c)})`))}\n\n` +
          "Places, people and quest beats a clue may lie at. Every 'at' must be copied exactly from one of these lines:\n" +
          `---BEGIN SPOTS---\n${spotLines(free, found.beatQuest)}\n---END SPOTS---`;
        sanitize = (parsed) => sanitizeClues(parsed, free, used);
      } else if (mode === "secrets") {
        const [secrets, found] = await Promise.all([canonTitles(admin, campaign.id, "secret"), loadSpots(admin, campaign.id)]);
        const existing = listOfTitles(secrets);
        system = base(secretShape());
        user_ = `${steer}Secrets the campaign already has (do not repeat them):\n${bullets(existing)}\n\n` +
          "Places, people and quest beats a clue may lie at. Every clue's 'at' id must be copied exactly from the second field of one of these lines (kind|id|name):\n" +
          `---BEGIN SPOTS---\n${spotLinesWithIds(found.spots, found.beatQuest)}\n---END SPOTS---`;
        sanitize = (parsed) => sanitizeSecrets(parsed, found.spots, existing);
      } else if (mode === "arcs") {
        const [arcs, themeRows] = await Promise.all([
          readRows<{ name: string }>(admin.from("canon_arcs").select("name").eq("campaign_id", campaign.id).order("sort_order", { ascending: true }).limit(MAX_ARCS)),
          readRows<{ id: string; premise_kind: string | null; title: string; body: string | null }>(
            admin.from("canon_entries").select("id, premise_kind, title, body").eq("campaign_id", campaign.id).eq("part", "premise").eq("premise_kind", "theme")
              .order("sort_order", { ascending: true }).limit(MAX_THEMES),
          ),
        ]);
        const themes: ThemeCandidate[] = themeRows
          .map((r) => ({ id: r.id, text: premiseEntryText(r.premise_kind, r.title, r.body).replace(/\s+/g, " ") }))
          .filter((t) => t.text !== "");
        const names = arcs.map((a) => a.name.trim()).filter((n) => n !== "");
        system = base(arcShape());
        user_ = `${steer}Arcs the campaign already has (do not repeat them):\n${bullets(names)}\n\n` +
          "Theme lines of the premise an arc may carry. A theme_id must be copied exactly from the first field of one of these lines (id|text):\n" +
          `---BEGIN THEMES---\n${themes.length > 0 ? themes.map((t) => `${t.id}|${t.text}`).join("\n") : "(no themes yet: leave theme_id out)"}\n---END THEMES---`;
        sanitize = (parsed) => sanitizeArcs(parsed, themes, names);
      } else if (mode === "peoples") {
        const [candidates, rows] = await Promise.all([
          loadPeopleCandidates(admin, campaign),
          readRows<{ species_id: string | null; library_species_id: string | null; monster_id: string | null; library_monster_id: string | null; percent: number | string; name: string | null }>(
            admin.from("campaign_peoples").select("species_id, library_species_id, monster_id, library_monster_id, percent, name").eq("campaign_id", campaign.id),
          ),
        ]);
        // Exactly one record column is set on a people (the table's check); its share still counts towards the 100.
        const listed: ListedPeople[] = rows.flatMap((r): ListedPeople[] => {
          const own = { name: r.name?.trim() || null, percent: Number(r.percent) };
          if (r.species_id) return [{ kind: "species", recordId: r.species_id, ...own }];
          if (r.library_species_id) return [{ kind: "library_species", recordId: r.library_species_id, ...own }];
          if (r.monster_id) return [{ kind: "monster", recordId: r.monster_id, ...own }];
          if (r.library_monster_id) return [{ kind: "library_monster", recordId: r.library_monster_id, ...own }];
          return [];
        });
        const nameOfRecord = new Map(candidates.map((c) => [`${c.kind}|${c.id}`, c.name]));
        const listedLines = listed.map((p) => `${p.name ?? nameOfRecord.get(`${p.kind}|${p.recordId}`) ?? `a ${p.kind.replace("_", " ")}`}: ${p.percent}%`);
        system = base(peopleShape());
        user_ = `${steer}Peoples the campaign already lists, with their shares (do not repeat them; the total of all shares never passes 100%):\n${bullets(listedLines)}\n\n` +
          "Species a people may be. Every record_id must be copied exactly from the second field of one of these lines (kind|id|name):\n" +
          `---BEGIN SPECIES---\n${candidates.length > 0 ? candidates.map((c) => `${c.kind}|${c.id}|${c.name}`).join("\n") : "(no species available: propose nothing)"}\n---END SPECIES---`;
        sanitize = (parsed) => sanitizePeoples(parsed, candidates, listed);
      } else if (mode === "backstory") {
        const member = backstoryMember!;
        const [entries, speciesRows] = await Promise.all([
          readRows<{ id: string }>(admin.from("canon_entries").select("id").eq("campaign_id", campaign.id).eq("part", "backstory").eq("party_member_id", partyMemberId)),
          member.species_id
            ? readRows<{ name: string }>(
              UUID.test(member.species_id)
                ? admin.from("species").select("name").eq("id", member.species_id).eq("campaign_id", campaign.id)
                : admin.from("library_species").select("name").eq("id", member.species_id),
            )
            : Promise.resolve([] as { name: string }[]),
        ]);
        const passages = entries[0]
          ? await readRows<{ title: string }>(admin.from("canon_lore_passages").select("title").eq("campaign_id", campaign.id).eq("entry_id", entries[0].id).limit(MAX_PASSAGES))
          : [];
        const titles = listOfTitles(passages);
        const sheet = [
          speciesRows[0]?.name ?? member.subrace,
          member.class ? `${member.class}${member.subclass ? ` (${member.subclass})` : ""}` : null,
          member.level ? `level ${member.level}` : null,
        ].filter((t): t is string => !!t && t.trim() !== "").join(", ");
        const before = toPlainText(member.player_description).trim();
        system = base(backstoryShape());
        user_ = `${steer}The character: ${wrapUserInput(member.name)}\n` +
          `What the sheet says: ${sheet !== "" ? sheet : "(nothing readable)"}\n\n` +
          `Before play, as the character's player wrote it:\n${before !== "" ? wrapUserInput(before) : "(nothing written yet)"}\n\n` +
          `Passages of the backstory already written (do not repeat them):\n${bullets(titles)}`;
        sanitize = (parsed) => sanitizeBackstory(parsed, titles);
      } else if (mode === "read") {
        const [entries, clues, steps, entryQuests, links, arcs, quests, sessions] = await Promise.all([
          readRows<LooseEntry & { body: string | null }>(
            admin.from("canon_entries").select("id, part, title, body, created_at, revealed_at, closed_as, arc_id, party_member_id, loose_end_left_at").eq("campaign_id", campaign.id)
              .order("part", { ascending: true }).order("sort_order", { ascending: true }),
          ),
          readRows<LooseClue>(admin.from("canon_clues").select("secret_id, location_id, npc_id, quest_beat_id, item_id, document_id, passage_id").eq("campaign_id", campaign.id)),
          readRows<{ force_id: string; reached_at: string | null }>(admin.from("canon_force_steps").select("force_id, reached_at").eq("campaign_id", campaign.id)),
          readRows<{ entry_id: string }>(admin.from("canon_entry_quests").select("entry_id").eq("campaign_id", campaign.id)),
          readRows<{ from_kind: string; from_id: string | null; to_kind: string; to_id: string | null; type: string }>(
            admin.from("world_links").select("from_kind, from_id, to_kind, to_id, type").eq("campaign_id", campaign.id).eq("from_kind", "canon").eq("to_kind", "canon"),
          ),
          readRows<{ id: string; name: string; status: string; loose_end_left_at: string | null }>(admin.from("canon_arcs").select("id, name, status, loose_end_left_at").eq("campaign_id", campaign.id)),
          readRows<{ status: string; arc_id: string | null }>(admin.from("quests").select("status, arc_id").eq("campaign_id", campaign.id)),
          readRows<{ created_at: string }>(admin.from("campaign_sessions").select("created_at").eq("campaign_id", campaign.id)),
        ]);
        const loose = looseEndFindings({ entries, clues, steps, entryQuests, links, arcs, quests, sessions });
        const listed = entries.slice(0, MAX_READ_ENTRIES);
        if (listed.length < 2) skipModelWith = loose;
        const nameOf = await loadMentionNames(admin, campaign.id, listed.flatMap((r) => collectMentions(r.body)));
        const lines = listed.map((e) => {
          const excerpt = toPlainText(e.body, nameOf).replace(/\s+/g, " ").trim().slice(0, READ_EXCERPT_CHARS);
          return `${e.id}|${e.part}|${e.title.trim()}${excerpt !== "" ? `|${excerpt}` : ""}`;
        });
        system = base(readShape());
        user_ = `${steer}Every entry of the canon, one per line as id|part|title|start of its text:\n${wrapUserInput(lines.join("\n"))}`;
        const knownIds = new Set(listed.map((e) => e.id));
        sanitize = (parsed) => {
          const { findings, setAside } = sanitizeContradictions(parsed, knownIds);
          return { suggestions: [...findings, ...loose], setAside };
        };
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
      // Every helper but the read (which lists the whole canon itself) reads what the canon already holds, so a draft builds
      // on what the DM has written so far instead of starting cold (#1282: the walk's later sections ignored its earlier).
      if (mode !== "read") {
        const digest = await loadCanonDigest(admin, campaign.id);
        if (digest.length > 0) {
          user_ += "\n\nWhat the canon already holds, beyond its premise. Build on it, stay consistent with it, and do not repeat it:\n" +
            wrapUserInput(digest.join("\n"));
        }
      }
      if (walkDraft) user_ += `\n\n${WALK_RANGE}`;
      // Nothing to read two of: the loose ends are free, no model is called and nothing is charged.
      if (skipModelWith) return json({ suggestions: skipModelWith, setAside: [], ai_provenance: null });
      let textResult: TextResult;
      try {
        const maxTokens = mode === "premise" || mode === "forces" ? 5000 : mode === "lore" || mode === "secrets" ? 4000 : 2500;
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
      // A read that found nothing wrong is an answer (and was paid for); a suggester that found nothing is not.
      if (mode !== "read" && suggestions.length === 0 && setAside.length === 0) {
        return jsonError(502, "generation_failed", "No usable suggestions. Nothing was charged; please try again.");
      }

      // Nothing the DM can accept is not a generation they pay for: show why, charge nothing (no `hold.charge`).
      if (mode !== "read" && suggestions.length === 0) return json({ suggestions, setAside, ai_provenance: null });
      hold.charge(LEDGER_REASON, {
        cost,
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
