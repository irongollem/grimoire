import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  wholeCredits,
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
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import {
  retrieveCampaignEntities,
  type CandidateEntity,
} from "../_shared/campaignEntityRetrieval.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { truncateAtWordBoundary } from "../_shared/embedTextUtil.ts";
import { sanitizeSuggestions } from "../_shared/npcRelationshipSuggestions.ts";
import { campaignToday, promptAge } from "../_shared/npcAge.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";

/**
 * NPC relationship suggester (#910).
 *
 * Proposes ties between one NPC and the rest of the campaign (other NPCs and
 * factions). NOTHING IS WRITTEN HERE: the response is a list of proposals the
 * DM accepts or dismisses one by one in the client.
 *
 * Candidates come from two places on purpose. Semantic retrieval ranks the
 * campaign's entities against the NPC, but it is an enhancement that can be
 * down or empty (nothing embedded yet), so a bounded direct read of the
 * campaign's other NPCs and factions always rides along. The model may only
 * name candidates, and `sanitizeSuggestions` drops everything else.
 *
 * Server-path only, like generate-complication: the candidate blocks come from
 * service-role reads the browser cannot make.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes, but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

const PROMPT_ROW = "npc_relationships";
const LEDGER_REASON = "npc_relationship_suggestion";

const MAX_DIRECT_NPCS = 40;
const MAX_DIRECT_FACTIONS = 30;
const FIELD_CHAR_LIMIT = 1500;

function plain(value: string | null | undefined): string {
  if (!value) return "";
  return truncateAtWordBoundary(toPlainText(value).replace(/\s+/g, " ").trim(), FIELD_CHAR_LIMIT);
}

interface SourceNpc {
  id: string;
  name: string;
  occupation: string | null;
  race: string | null;
  personality: string | null;
  backstory: string | null;
  appearance: string | null;
  age: string | null;
  born_year: number | null;
  born_month: number | null;
  born_day: number | null;
  status: string;
  died_year: number | null;
}

interface NamedRow { id: string; name: string; occupation?: string | null; faction_type?: string | null }
interface PersonRow { id: string; name: string; born_year: number | null }
interface KinRow {
  from_npc_id: string | null;
  from_party_member_id: string | null;
  to_npc_id: string | null;
  to_party_member_id: string | null;
  kind: string;
  parent_role: string | null;
  adoptive: boolean;
}

/** The inverse of a bond, to read a tie from the other end. Mirrors NPC_RELATIONSHIP_INVERSE (src/types/npc.types.ts). */
const BOND_INVERSE: Record<string, string> = { mentor: "apprentice", apprentice: "mentor", subordinate: "superior", superior: "subordinate" };

const MAX_PCS = 30;

/** What `other` is to the source, read from the source's end of a stored kin link. */
function kinWord(link: KinRow, sourceIsFrom: boolean): string {
  if (link.kind === "parent") {
    if (sourceIsFrom) return link.adoptive ? "adoptive child" : "child";
    const role = link.parent_role ?? "parent";
    return link.adoptive ? `adoptive ${role}` : role;
  }
  return link.kind === "former_spouse" ? "former spouse" : link.kind;
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

  let campaign_id: string, npc_id: string, prompt: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    npc_id = body.npc_id;
    if (typeof campaign_id !== "string" || !campaign_id) throw new Error("invalid");
    if (typeof npc_id !== "string" || !npc_id) throw new Error("invalid");
    prompt = typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    return new Response("Invalid body: need { campaign_id, npc_id }", { status: 400 });
  }

  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, current_year, current_month, current_day, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  // DMs only, not every member: this reads NPC backstories and DM-only ties
  // with the service role, and its notes would carry those secrets to a player.
  if (!(await isCampaignDm(admin, campaign, user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  // The source NPC, scoped to the campaign the caller was just authorised for.
  const { data: sourceRow } = await admin
    .from("npcs")
    .select("id, name, occupation, race, personality, backstory, appearance, age, born_year, born_month, born_day, status, died_year")
    .eq("id", npc_id)
    .eq("campaign_id", campaign_id)
    .maybeSingle();
  if (!sourceRow) return new Response("NPC not found", { status: 404 });
  const source = sourceRow as SourceNpc;

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

  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  // The platform decides the text model: a campaign on platform credits runs on
  // whichever provider the admin enabled, and `campaign.text_provider` only counts
  // when the campaign holds its own key for it. Refuse before anything is spent.
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
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Gate before any paid provider work, retrieval's embedding included (#466).
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
    // ── What the NPC already has ─────────────────────────────────────────────
    const [relsRes, memberRes, npcsRes, factionsRes, kinRes, pcsRes] = await Promise.all([
      admin.from("npc_relationships")
        .select("npc_id, related_npc_id, relationship_type")
        .eq("campaign_id", campaign_id)
        .or(`npc_id.eq.${npc_id},related_npc_id.eq.${npc_id}`),
      admin.from("faction_npcs")
        .select("faction_id")
        .eq("npc_id", npc_id),
      admin.from("npcs")
        .select("id, name, occupation")
        .eq("campaign_id", campaign_id)
        .neq("id", npc_id)
        .order("updated_at", { ascending: false })
        .limit(MAX_DIRECT_NPCS * 2),
      admin.from("factions")
        .select("id, name, faction_type")
        .eq("campaign_id", campaign_id)
        .order("updated_at", { ascending: false })
        .limit(MAX_DIRECT_FACTIONS * 2),
      // The whole campaign's kin: the source's own links, and its parents' other children for implied siblings.
      admin.from("kin_links")
        .select("from_npc_id, from_party_member_id, to_npc_id, to_party_member_id, kind, parent_role, adoptive")
        .eq("campaign_id", campaign_id),
      // A PC's name and birth year only; nothing else of theirs reaches the prompt.
      admin.from("party_members")
        .select("id, name, born_year")
        .eq("campaign_id", campaign_id)
        .limit(MAX_PCS),
    ]);
    if (kinRes.error) throw new Error(kinRes.error.message);
    if (pcsRes.error) throw new Error(pcsRes.error.message);
    if (relsRes.error) throw new Error(relsRes.error.message);
    if (memberRes.error) throw new Error(memberRes.error.message);
    if (npcsRes.error) throw new Error(npcsRes.error.message);
    if (factionsRes.error) throw new Error(factionsRes.error.message);

    const campaignNpcs = (npcsRes.data ?? []) as NamedRow[];
    const campaignFactions = (factionsRes.data ?? []) as NamedRow[];
    const npcNameById = new Map(campaignNpcs.map((n) => [n.id, n.name]));
    const factionNameById = new Map(campaignFactions.map((f) => [f.id, f.name]));

    const existingTies = (relsRes.data ?? []).map((r) => {
      const sourceIsFrom = r.npc_id === npc_id;
      const otherId = sourceIsFrom ? r.related_npc_id : r.npc_id;
      const raw = r.relationship_type as string;
      // Read from the source's end: the row's type is what related_npc_id is to npc_id.
      const type = sourceIsFrom ? raw : (BOND_INVERSE[raw] ?? raw);
      return { otherId, name: npcNameById.get(otherId) ?? null, type };
    });
    const existingNpcNames = existingTies.flatMap((t) => (t.name ? [t.name] : []));

    // ── Kin the source already has, and what the shared parents imply ──────
    const kinRows = (kinRes.data ?? []) as KinRow[];
    const pcs = (pcsRes.data ?? []) as PersonRow[];
    const pcNameById = new Map(pcs.map((p) => [p.id, p.name]));
    const endKey = (npcId: string | null, pcId: string | null) => (npcId ? `npc:${npcId}` : `pc:${pcId}`);
    const sourceKey = `npc:${npc_id}`;
    const ownKin: { other: string; word: string }[] = [];
    const sourceParents = new Set<string>();
    for (const l of kinRows) {
      const from = endKey(l.from_npc_id, l.from_party_member_id);
      const to = endKey(l.to_npc_id, l.to_party_member_id);
      if (from !== sourceKey && to !== sourceKey) continue;
      const sourceIsFrom = from === sourceKey;
      ownKin.push({ other: sourceIsFrom ? to : from, word: kinWord(l, sourceIsFrom) });
      if (l.kind === "parent" && !sourceIsFrom) sourceParents.add(from);
    }
    // A shared parent makes two people siblings without a sibling link.
    const siblingThrough = new Map<string, string>();
    for (const l of kinRows) {
      const parent = endKey(l.from_npc_id, l.from_party_member_id);
      if (l.kind !== "parent" || !sourceParents.has(parent)) continue;
      const child = endKey(l.to_npc_id, l.to_party_member_id);
      if (child !== sourceKey) siblingThrough.set(child, parent);
    }
    // Names for everyone the kin touches, beyond the capped candidate list.
    const kinNpcIds = new Set<string>();
    for (const k of [...ownKin.map((o) => o.other), ...siblingThrough.keys(), ...siblingThrough.values()]) {
      if (k.startsWith("npc:")) kinNpcIds.add(k.slice(4));
    }
    const kinNpcRows = new Map<string, PersonRow>();
    if (kinNpcIds.size > 0) {
      const { data, error } = await admin.from("npcs").select("id, name, born_year")
        .eq("campaign_id", campaign_id).in("id", [...kinNpcIds]);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as PersonRow[]) kinNpcRows.set(r.id, r);
    }
    const personName = (k: string): string | null =>
      k.startsWith("npc:") ? (kinNpcRows.get(k.slice(4))?.name ?? null) : (pcNameById.get(k.slice(3)) ?? null);
    const existingKinNpcNames: string[] = [];
    const existingKinPcNames: string[] = [];
    for (const o of ownKin) {
      const n = personName(o.other);
      if (n) (o.other.startsWith("npc:") ? existingKinNpcNames : existingKinPcNames).push(n);
    }
    const impliedSiblings: Record<string, string> = {};
    for (const [child, parent] of siblingThrough) {
      const childName = personName(child);
      const parentName = personName(parent);
      if (childName && parentName) impliedSiblings[`${child.startsWith("npc:") ? "npc" : "pc"}:${childName.trim().toLowerCase()}`] = parentName;
    }

    const memberFactionIds = new Set((memberRes.data ?? []).map((m) => m.faction_id as string));
    const existingFactionNames = [...memberFactionIds].flatMap((id) => {
      const n = factionNameById.get(id);
      return n ? [n] : [];
    });

    // ── Candidates: retrieval first, then a direct read as the floor ─────────
    const retrievalQuery = [
      source.name,
      source.occupation,
      plain(source.personality).slice(0, 300),
      plain(source.backstory).slice(0, 300),
      prompt.trim(),
    ].filter(Boolean).join(". ");

    let retrievedNpcs: CandidateEntity[] = [];
    let retrievedFactions: CandidateEntity[] = [];
    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQuery]);
      // Recorded as soon as embed() returns: the spend is real even if a later
      // step throws. Platform-paid, charged to nobody.
      await recordFreeGeneration(admin, user.id, "entity_embedding", {
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
      retrievedNpcs = found.npcs;
      retrievedFactions = found.factions;
    } catch (e) {
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`NPC relationship retrieval unavailable for campaign ${campaign_id}, using direct candidates only: ${why}`);
    }

    const sourceNameKey = source.name.trim().toLowerCase();
    const existingFactionKeys = new Set(existingFactionNames.map((n) => n.toLowerCase()));

    function merge(
      retrieved: CandidateEntity[],
      direct: CandidateEntity[],
      excluded: Set<string>,
      cap: number,
    ): CandidateEntity[] {
      const seen = new Set<string>();
      const out: CandidateEntity[] = [];
      for (const c of [...retrieved, ...direct]) {
        const k = c.name.trim().toLowerCase();
        if (!k || k === sourceNameKey || excluded.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push(c);
        if (out.length >= cap) break;
      }
      return out;
    }

    const npcCandidates = merge(
      retrievedNpcs,
      // Bonded NPCs stay candidates: the same person can also be kin. Sanitising drops a repeated bond.
      campaignNpcs.map((n) => ({ name: n.name, descriptor: n.occupation ?? null })),
      new Set<string>(),
      MAX_DIRECT_NPCS + retrievedNpcs.length,
    );
    const factionCandidates = merge(
      retrievedFactions,
      campaignFactions.map((f) => ({ name: f.name, descriptor: f.faction_type ?? null })),
      existingFactionKeys,
      MAX_DIRECT_FACTIONS,
    );

    if (npcCandidates.length === 0 && factionCandidates.length === 0 && pcs.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "There are no other NPCs, characters or factions in this campaign to connect to yet." }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Birth years: the source, the candidates, the PCs ─────────────────────
    const today = campaignToday(campaign);
    const bornYears: Record<string, number> = {};
    const diedYears: Record<string, number> = {};
    if (npcCandidates.length > 0) {
      const { data, error } = await admin.from("npcs").select("name, status, born_year, died_year")
        .eq("campaign_id", campaign_id).in("name", npcCandidates.map((c) => c.name));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { name: string; status: string; born_year: number | null; died_year: number | null }[]) {
        if (r.born_year !== null) bornYears[`npc:${r.name.trim().toLowerCase()}`] = r.born_year;
        // Status decides who is dead; a date left on a living NPC is ignored, as everywhere else.
        if (r.status === "dead" && r.died_year !== null) diedYears[`npc:${r.name.trim().toLowerCase()}`] = r.died_year;
      }
    }
    for (const p of pcs) {
      if (p.born_year !== null) bornYears[`pc:${p.name.trim().toLowerCase()}`] = p.born_year;
    }

    // ── Prompt ────────────────────────────────────────────────────────────────
    const age = promptAge(source, today);
    const sourceLines = [
      `Name: ${source.name}`,
      source.race ? `Race: ${source.race}` : "",
      source.occupation ? `Occupation: ${source.occupation}` : "",
      source.born_year !== null ? `Born: ${source.born_year}` : "",
      source.status === "dead" && source.died_year !== null ? `Died: ${source.died_year}` : "",
      age ? `Age now: ${age}` : "",
      today ? `Current year: ${today.year}` : "",
      plain(source.personality) ? `Personality: ${plain(source.personality)}` : "",
      plain(source.backstory) ? `Backstory: ${plain(source.backstory)}` : "",
      plain(source.appearance) ? `Appearance: ${plain(source.appearance)}` : "",
    ].filter(Boolean);

    // Each tie reads from the source outwards: "Tilda Fenn - their mentor".
    const tieLines = existingTies
      .filter((t) => t.name)
      .map((t) => `${t.name} - their ${t.type.replace(/_/g, " ")}`);
    const kinLines = ownKin.flatMap((o) => {
      const n = personName(o.other);
      return n ? [`${n} - their ${o.word}`] : [];
    });

    const bornSuffix = (type: "npc" | "pc", name: string) => {
      const key = `${type}:${name.trim().toLowerCase()}`;
      const born = bornYears[key];
      const died = diedYears[key];
      return [born === undefined ? "" : `born ${born}`, died === undefined ? "" : `died ${died}`].filter(Boolean).join(", ");
    };

    const steer = prompt.trim() ? `${wrapUserInput(prompt.trim())}\n\n` : "";
    const userContent =
      `${steer}The NPC to connect:\n---BEGIN NPC---\n${sourceLines.join("\n")}\n---END NPC---` +
      (tieLines.length > 0 ? `\n\nBonds this NPC already has (do not repeat them):\n${tieLines.join("\n")}` : "") +
      (kinLines.length > 0 ? `\n\nFamily this NPC already has (do not repeat them):\n${kinLines.join("\n")}` : "") +
      (existingFactionNames.length > 0 ? `\n\nFactions this NPC already belongs to (do not repeat them):\n${existingFactionNames.join("\n")}` : "") +
      "\n\nCandidates. Every target_name must be copied exactly from one of these lines " +
      "(npc|name|occupation|born year, pc|name|born year or faction|name|type); the app resolves them back to real records by name.\n" +
      "---BEGIN CANDIDATES---\n" +
      [
        ...npcCandidates.map((c) => {
          const born = bornSuffix("npc", c.name);
          return `npc|${c.name}|${c.descriptor ?? ""}${born ? `|${born}` : ""}`;
        }),
        ...pcs.map((p) => {
          const born = bornSuffix("pc", p.name);
          return `pc|${p.name}${born ? `|${born}` : ""}`;
        }),
        ...factionCandidates.map((c) => `faction|${c.name}|${c.descriptor ?? ""}`),
      ].join("\n") +
      "\n---END CANDIDATES---";

    const textModel = text.config?.text_model;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
        maxTokens: 1200,
      });
    } catch (e) {
      await releaseCredits(admin, reservation.ids);
      console.error("NPC relationship text generation failed:", e);
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

    const { suggestions, setAside } = sanitizeSuggestions(parsed, {
      sourceName: source.name,
      npcNames: npcCandidates.map((c) => c.name),
      factionNames: factionCandidates.map((c) => c.name),
      existingNpcNames,
      existingFactionNames,
      pcNames: pcs.map((p) => p.name),
      existingKinNpcNames,
      existingKinPcNames,
      sourceBornYear: source.born_year,
      bornYears,
      impliedSiblings,
    });
    // A set-aside claim is still worth showing: it tells the DM why nothing was offered.
    if (suggestions.length === 0 && setAside.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "No usable suggestions. Try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    await releaseCredits(admin, reservation.ids);
    // Nothing the DM can accept is not a generation they pay for: show why, charge nothing (as an empty result
    // never was).
    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ suggestions, setAside, grounded: retrievedNpcs.length + retrievedFactions.length > 0, ai_provenance: null }),
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
      JSON.stringify({
        suggestions,
        setAside,
        grounded: retrievedNpcs.length + retrievedFactions.length > 0,
        ai_provenance,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("NPC relationship suggestion failed:", e);
    return new Response(
      JSON.stringify({ error: "Could not build suggestions, please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}));
