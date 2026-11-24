import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
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
import { retrieveMonsterCandidates, type CandidateMonster } from "../_shared/monsterRetrieval.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { repairGeneratedNames } from "../_shared/nameRepairWire.ts";
import { repaired } from "../_shared/nameRepair.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { readClientConstraints } from "../_shared/clientConstraints.ts";

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
  id: string;
  name: string;
  monster_type: string;
  /** Nullable in the table; a row without one is offered with an unknown CR rather than throwing. */
  stat_block: { challenge_rating?: string } | null;
}

// How many rows each side contributes. Custom monsters get a guaranteed share
// rather than competing in one merged ranking — 3,541 library rows would
// otherwise crowd out all ~98 of the DM's homebrew, making the feature worst
// at exactly the thing it should be best at.
const RETRIEVAL_PER_SIDE = 15;
// Cap on unembedded custom monsters appended after retrieval (see below).
const MAX_UNEMBEDDED_APPEND = 25;

/** Compact-index fallback row → candidate. The retrieval path's equivalent
 *  mapping lives in _shared/monsterRetrieval.ts; this one stays because the
 *  fallback (which that module deliberately does not own) still needs it. */
function fromCustomRow(row: CustomMonsterRow): CandidateMonster {
  return {
    id: row.id,
    name: row.name,
    cr: row.stat_block?.challenge_rating ?? "?",
    type: row.monster_type,
  };
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

interface EncounterCampaign extends BaseCampaign {
  game_system: string | null;
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : undefined;
  if (!body || !campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : "auto";
  // The creature rolled from the habitat of the party's place, among others (#1255). User input: wrapped with the prompt.
  const clientConstraints = readClientConstraints(body.constraints);

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return jsonError(400, "invalid_difficulty", `Invalid difficulty: must be one of ${VALID_DIFFICULTIES.join(", ")}.`);
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<EncounterCampaign>(admin, campaign_id, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system.
  // 5e-shaped output with no meaning in a Generic campaign (#934): the client
  // hides the button, this is the server-side backstop. No edition, no fallback.
  const ruleset = gameSystemEdition(campaign.game_system);
  if (!ruleset) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  const rulesetKey = rulesetContextKey(campaign.game_system);

  // ── Server-side context: party summary + custom monster index ─────────────
  const { data: partyMemberRows, error: partyError } = await admin
    .from("party_members")
    .select("id, name, class, level")
    .eq("campaign_id", campaign_id);
  if (partyError) throw partyError;
  const partyMembers = (partyMemberRows ?? []) as PartyMemberRow[];

  let classesByMember = new Map<string, CharacterClassRow[]>();
  if (partyMembers.length > 0) {
    const { data: classRows, error: classError } = await admin
      .from("character_classes")
      .select("party_member_id, class_name, levels")
      .in("party_member_id", partyMembers.map((m) => m.id));
    if (classError) throw classError;
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

  // The compact-index FALLBACK, used when retrieval (below) is unavailable. It
  // carries the same campaign scope #597 put on match_custom_monsters, or every
  // creature that path now excludes leaks back in the moment retrieval has a bad
  // day — the failure being invisible by design (see the catch below). Owner-eq
  // is kept alongside for the reason monsterRetrieval.ts gives. Also excludes
  // Open5e-imported rows (the model already knows standard 5e monsters) and rows
  // pinned to another ruleset.
  const { data: customMonsterRows, count: customMonsterTotal, error: customMonsterError } = await admin
    .from("monsters")
    .select("id, name, monster_type, stat_block", { count: "exact" })
    .eq("user_id", campaign.user_id)
    .or(`campaign_id.eq.${campaign_id},and(campaign_id.is.null,user_id.eq.${campaign.user_id})`)
    .or("open5e_import.is.null,open5e_import.eq.false")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name")
    .limit(MAX_CUSTOM_MONSTERS);
  if (customMonsterError) throw customMonsterError;
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

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["encounter", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "encounter");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  // The platform picks the model: the provider the admin enabled.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = await fetchCreditCost(admin, "encounter_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above callText.
  // Retrieval makes its own billed embedding request, and because that request
  // is recorded at delta 0 it never touches the caller's balance — so the
  // reservation is not a second line of defence for it. Gate first, embed
  // after: otherwise any authenticated campaign member can loop this endpoint
  // and run up unbounded platform spend that no throttle and no balance check
  // ever sees.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: "encounter_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#595) ────────────────────────────────────────────
    // An ENHANCEMENT over the compact index built above, which remains the
    // fallback. Retrieval must never be able to take encounter generation down:
    // a missing vendor, a mid-flip config, a provider outage or an RPC error all
    // cost recall, not the feature. Hence the whole block is one try/catch whose
    // failure path simply leaves `retrieved` null.
    //
    // Why it is worth doing: without it the model only knows the DM's custom
    // monsters plus whatever 5e it learned in training. That covers the 656 SRD
    // rows in library_monsters but not the other ~2,885 (Kobold Press, EN
    // Publishing and friends) — it may know those concepts but not their exact
    // names, and resolution is by name. Retrieval is what makes them reachable.
    let retrieved: CandidateMonster[] | null = null;

    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([prompt]);

      // Queued HERE, not after the RPCs below — real provider spend was
      // incurred the moment embed() returned, and everything after this point
      // can throw into the catch. A free line is written whatever the work
      // does, so a transient DB error cannot turn real money into invisible
      // spend. embed-monsters makes the same call for the same reason.
      //
      // Platform-paid, charged to nobody. Recorded as `monster_embedding`, not
      // the `entity_embedding` its siblings use, because what is embedded here
      // is monsters and the reason names what was embedded.
      hold.free("monster_embedding", {
        model:        embedProvider.model,
        provider:     embedUsage.provider,
        input_tokens: embedUsage.input_tokens,
      });

      // Two-corpus bestiary retrieval, extracted to _shared/monsterRetrieval.ts
      // when generate-complication (#604) became its second consumer. The
      // compact-index fallback below is NOT part of that module and stays here:
      // encounter building must always offer creatures, which is this
      // function's duty alone.
      const candidates = await retrieveMonsterCandidates(admin, {
        queryVector:    toVectorLiteral(vectors[0]),
        ownerId:        campaign.user_id,
        campaignId:     campaign_id,
        ruleset,
        embeddingModel: embedProvider.model,
        perSide:        RETRIEVAL_PER_SIDE,
        unembeddedCap:  MAX_UNEMBEDDED_APPEND,
      });
      if (candidates.length > 0) retrieved = candidates;

    } catch (e) {
      // Diagnosable, but never fatal.
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`Encounter retrieval unavailable for campaign ${campaign_id}, falling back to the compact index: ${why}`);
    }

    const constraints: string[] = [`Difficulty: ${difficulty}`, partySummary];

    const candidateBlock: CandidateMonster[] = retrieved ?? customMonsters.map(fromCustomRow);
    if (candidateBlock.length > 0) {
      const monsterLines = candidateBlock.map((c) => `${c.name}|${c.cr}|${c.type}`);
      // The truncation note only applies to the fallback path — the retrieved set
      // is a relevance-ranked selection, not a partial alphabetical slice, so
      // warning the model that it is "incomplete" would be misleading.
      const truncationNote = retrieved === null && customMonsterTruncated
        ? ` NOTE: this is the first ${customMonsters.length} of ${customMonsterTotal} custom monsters, ordered by name — the DM has others not shown here.`
        : "";
      constraints.push(
        "Monsters available in the DM's bestiary that fit this concept; prefer the DM's own creations " +
        "when one works. One per line as Name|CR|type. Use the exact name shown — the app resolves these " +
        "back to real bestiary entries by name, and a name that is not on this list and is not a standard " +
        "5e monster becomes a manual chore for the DM." +
        truncationNote + "\n" +
        "---BEGIN AVAILABLE MONSTERS---\n" +
        monsterLines.join("\n") +
        "\n---END AVAILABLE MONSTERS---",
      );
    }
    const dmInput = clientConstraints.length > 0 ? `${prompt}\n\n${clientConstraints.join("\n")}` : prompt;
    const userContent = `${wrapUserInput(dmInput)}\n\nConstraints:\n${constraints.join("\n")}`;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        maxTokens: 1200,
      });
    } catch (e) {
      console.error("Encounter text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The encounter came back unreadable. Nothing was charged; please try again.");
    let encounterData: EncounterData;
    try {
      encounterData = JSON.parse(textResult.content) as EncounterData;
    } catch {
      return malformed();
    }
    // A reply of `null` parses fine, so it is checked here rather than read through.
    if (!encounterData || !Array.isArray(encounterData.combatants) || encounterData.combatants.length === 0) return malformed();

    // Charged the moment the paid call has produced a usable result.
    hold.charge("encounter_generation", {
      cost,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // A near miss ("Skeletal Archers", "Dire Wolf Alpha") is put to a judgment model against exactly the
    // creatures the prompt offered and rewritten to the offered name when it is confident, so the client's
    // exact-name resolver finds the row (#1061). Free to the user; off until a typesafe key exists.
    // A polish step: if it fails the encounter goes out unrepaired rather than a paid result turning into a 500.
    try {
      const [combatantRepairs] = await repairGeneratedNames(admin, user.id, [{
        names: encounterData.combatants
          .filter((c) => typeof c?.name === "string")
          .map((c) => ({ name: c.name, note: typeof c.role === "string" ? c.role : undefined })),
        offered: candidateBlock.map((c) => ({ name: c.name, hint: `CR ${c.cr} ${c.type}` })),
        context: "A D&D combat encounter. Each combatant is a creature, from the DM's bestiary where possible.",
      }]);
      encounterData = {
        ...encounterData,
        combatants: encounterData.combatants.map((c) =>
          typeof c?.name === "string" ? { ...c, name: repaired(combatantRepairs, c.name) } : c),
      };
    } catch (e) {
      console.warn("Encounter name repair failed; returning the encounter unrepaired:", e);
    }

    const ai_provenance: AiProvenance = {
      generatorType: "encounter_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...encounterData, ai_provenance });
  });
}));
