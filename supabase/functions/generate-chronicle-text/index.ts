import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordFreeGeneration,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_CHRONICLE,
  INJECTION_GUARD_SUFFIX,
  toPlainText,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { collapseWhitespace, truncateAtWordBoundary } from "../_shared/embedTextUtil.ts";
import { corsHeaders, withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import { retrieveCampaignEntities, formatEntityBlock } from "../_shared/campaignEntityRetrieval.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";

/**
 * Retrieval-grounded Chronicler recap generator (#600, third grounded
 * generator after generate-encounter #595 and generate-quest #600). Adds
 * "what came before" to the chronicle prompt: the campaign's own NPCs/
 * locations/factions (the same retrieval generate-quest established) PLUS
 * the DM's prior session notes and previously-generated chronicles (new
 * here — see match_campaign_notes in 20260804000001), so a recap can call
 * back to earlier sessions by name instead of treating every session as
 * the campaign's first.
 *
 * This uses `_shared/textGen.ts`'s explicit plain-text output mode. Do not
 * switch it back to JSON: JSON mode previously truncated narratives when an
 * unescaped quote appeared in prose (commit 97261fe1).
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Prior-chronicles retrieval (#600) ────────────────────────────────────────

// match_count for match_campaign_notes -- deliberately smaller than
// generate-quest's NPC/location/faction counts (12/10/8): a recap's "what
// came before" is a handful of the most relevant past sessions, not a broad
// candidate pool the model picks from.
const PRIOR_NOTE_MATCH_COUNT = 6;

// Per-note snippet cap, distinct from entityEmbedText.ts's
// NOTE_CONTENT_CHAR_LIMIT (4000) -- that limit bounds what gets EMBEDDED
// (one note, once); this one bounds what gets INJECTED INTO THE PROMPT (up
// to PRIOR_NOTE_MATCH_COUNT notes, every chronicle generation), so it has to
// stay small enough that six of them plus the current session's raw_text
// (already capped at AI_PROMPT_LIMIT_CHRONICLE=10000) don't crowd the
// context budget.
const PRIOR_NOTE_SNIPPET_CHAR_LIMIT = 600;

interface PriorNoteCandidate {
  title: string;
  category: string;
  session_num: number | null;
  snippet: string;
}

/**
 * Render retrieved prior notes/chronicles into the fixed-format block
 * appended to the USER content, mirroring formatEntityBlock's role in
 * campaignEntityRetrieval.ts but kept local here rather than shared: this
 * shape (a chronological "what came before" timeline) is Chronicler-specific,
 * unlike the campaign-entity block quest/roll-table both reuse unmodified.
 *
 * Callers decide WHETHER to call this (skipped, same as formatEntityBlock,
 * when retrieval found zero prior notes) so a note-free campaign's prompt
 * carries no empty ---BEGIN/END--- shell.
 */
function formatPriorChroniclesBlock(notes: PriorNoteCandidate[]): string {
  const lines = notes.map((n) => {
    // Session number when the note has one; category ("session") as the
    // fallback label for unnumbered session notes. Retrieval is restricted
    // to category 'session' (see the RPC call's p_categories comment), so
    // no other category can appear here.
    const label = n.session_num != null ? `Session ${n.session_num} — ${n.title}` : `${n.category} — ${n.title}`;
    return `[${label}] ${n.snippet}`;
  });
  return (
    "\n\nThis is what came before in this campaign — use it for continuity, callbacks, and " +
    "consistent names. Do not re-narrate past events: the recap you are writing covers only " +
    "the new session's facts.\n" +
    "---BEGIN PRIOR CHRONICLES---\n" +
    lines.join("\n") +
    "\n---END PRIOR CHRONICLES---"
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  const cors = corsHeaders(req); // kept for responses that set extra headers alongside CORS
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

  let campaign_id: string, raw_text: string, tone_instruction: string, entity_descriptions: string[], exclude_note_id: string | null;

  try {
    const body = await req.json();
    campaign_id        = body.campaign_id;
    raw_text           = body.raw_text;
    tone_instruction   = body.tone_instruction ?? "";
    entity_descriptions = Array.isArray(body.entity_descriptions) ? body.entity_descriptions : [];
    // Optional — the note open in the editor, so match_campaign_notes never
    // retrieves the very note this chronicle is about to be inserted into.
    // May be absent: an unsaved note has no id yet, and older callers simply
    // predate this field.
    exclude_note_id = typeof body.exclude_note_id === "string" && body.exclude_note_id ? body.exclude_note_id : null;
    if (!campaign_id || !raw_text) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, raw_text, tone_instruction, entity_descriptions, exclude_note_id? }", { status: 400 });
  }

  const promptCheck = validatePromptInput(raw_text, AI_PROMPT_LIMIT_CHRONICLE);
  if (!promptCheck.ok) return promptCheck.errorResponse;

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

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["chronicle_text", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "chronicle_text");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  // Client-supplied entity descriptions, filled into the {entities} system-
  // prompt placeholder -- unrelated to the RAG-retrieved campaign-entity
  // block below (retrievedEntityBlock), which is a SEPARATE, additional
  // source of grounding appended to the USER content instead. Renamed from
  // this function's pre-#600 `entityBlock` purely to avoid colliding with
  // that new name -- the {entities} template mechanism itself is unchanged.
  const entityDescriptionsBlock = entity_descriptions.length > 0
    ? entity_descriptions.map((d) => `- ${d}`).join("\n")
    : "No specific entities mentioned.";

  const settingBlock = campaign.ai_setting_prompt?.trim() ?? "No setting configured.";

  const systemContent = promptRow.content
    .replace("{entities}", entityDescriptionsBlock)
    .replace("{settingPrompt}", settingBlock)
    .replace("{toneInstruction}", tone_instruction) +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    INJECTION_GUARD_SUFFIX;

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

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseChronicleTextCost = textIsByok ? 0 : await fetchCreditCost(admin, "chronicle_text");
  const chronicleTextCost = applyMultiplier(baseChronicleTextCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);
  // Atomic affordability gate: hold the balance across the paid call.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above the text
  // call. Retrieval makes its own billed embedding request, and because that
  // request is recorded at delta 0 it never touches the caller's balance --
  // so the reservation is not a second line of defence for it. Gate first,
  // embed after -- see generate-quest's identical comment for the full
  // reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, chronicleTextCost, "chronicle_text");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  // ── Semantic retrieval (#600 — the Chronicler) ─────────────────────────────
  // An ENHANCEMENT, not a requirement: retrieval must never be able to take
  // chronicle generation down. One try/catch around BOTH retrievals below --
  // same "any single failure drops the WHOLE block" contract generate-quest's
  // retrieveCampaignEntities documents, extended here to two retrieval kinds:
  // a chronicle grounded in real NPCs but continuity-blind (or vice versa) is
  // a more confusing failure mode than "no grounding this time." The failure
  // path leaves both blocks empty and the prompt falls back to exactly the
  // pre-#600 behavior (raw_text + the client-supplied entity_descriptions
  // block only, via {entities} above).
  //
  // Zero-RESULT is different from failure: a legitimately empty retrieval
  // (brand-new campaign, first-ever session) still counts as success, and
  // the two blocks are independent of each other in that case -- a campaign
  // with real NPCs but no prior notes yet still gets the entity block.
  let retrievedEntityBlock = "";
  let priorChroniclesBlock = "";

  try {
    const embedProvider = await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
    const { vectors, usage: embedUsage } = await embedProvider.embed([raw_text]);

    // Recorded HERE, not after the RPCs below -- real provider spend was
    // incurred the moment embed() returned, and everything after this point
    // can throw into the catch. Platform-paid, charged to nobody: is_byok
    // stays false because we, not the user, paid for it -- see
    // recordFreeGeneration's doc comment.
    await recordFreeGeneration(admin, user.id, "entity_embedding", {
      model:        embedProvider.model,
      provider:     embedUsage.provider,
      input_tokens: embedUsage.input_tokens,
    });

    // ONE embedding of raw_text, reused for BOTH retrievals below -- the
    // session notes being turned into a chronicle ARE the query for "what in
    // this campaign is relevant," for both entities and prior notes alike.
    const queryVector = toVectorLiteral(vectors[0]);

    const candidates = await retrieveCampaignEntities(admin, {
      queryVector,
      campaignId:     campaign_id,
      // The OWNER, not the caller -- matching generate-quest's bestiary
      // scoping. A campaign member generating a chronicle sees the DM's
      // NPCs, factions and locations, not their own.
      ownerId:        campaign.user_id,
      embeddingModel: embedProvider.model,
    });
    const totalCandidates = candidates.npcs.length + candidates.locations.length + candidates.factions.length;
    if (totalCandidates > 0) {
      retrievedEntityBlock = formatEntityBlock(candidates, "writing the chronicle");
    } else {
      console.warn(`Chronicle retrieval found zero campaign entities for campaign ${campaign_id} — building the prompt without the entity block.`);
    }

    const noteMatch = await admin.rpc("match_campaign_notes", {
      query_embedding:   queryVector,
      p_campaign_id:     campaign_id,
      p_owner_id:        campaign.user_id,
      p_embedding_model: embedProvider.model,
      p_exclude_id:      exclude_note_id,
      // 'session' ONLY, though every note category is embedded. A chronicle
      // is player-facing prose; session notes narrate what already happened
      // at the table, while lore/quest/faction/location/general notes are
      // the DM's planning material — an unrevealed twist retrieved from a
      // lore note would surface in the recap as a "callback", leaking the
      // spoiler in the DM's own voice. Spoiler containment, not relevance
      // tuning: do not widen this without a per-note "revealed" signal.
      p_categories:      ["session"],
      match_count:       PRIOR_NOTE_MATCH_COUNT,
    });
    if (noteMatch.error) throw new Error(`match_campaign_notes: ${noteMatch.error.message}`);
    const matchedIds = ((noteMatch.data ?? []) as { id: string }[]).map((r) => r.id);

    if (matchedIds.length > 0) {
      const { data: noteRows, error: noteError } = await admin
        .from("notes")
        .select("id, title, category, session_num, content, created_at")
        .in("id", matchedIds);
      if (noteError) throw new Error(noteError.message);

      type NoteContentRow = { id: string; title: string; category: string; session_num: number | null; content: string | null; created_at: string };
      // Re-sorted into chronological order for presentation -- the RPC's
      // relevance ranking above only decided WHICH notes to include, not
      // what order best serves "read this as a timeline." Notes without a
      // session number (matched by relevance rather than being an actual
      // past session) sort last, since they aren't part of the sequence.
      const sorted = ((noteRows ?? []) as NoteContentRow[]).slice().sort((a, b) => {
        if (a.session_num == null && b.session_num == null) return a.created_at.localeCompare(b.created_at);
        if (a.session_num == null) return 1;
        if (b.session_num == null) return -1;
        if (a.session_num !== b.session_num) return a.session_num - b.session_num;
        return a.created_at.localeCompare(b.created_at);
      });

      if (sorted.length > 0) {
        priorChroniclesBlock = formatPriorChroniclesBlock(sorted.map((row) => ({
          title:       row.title,
          category:    row.category,
          session_num: row.session_num,
          snippet:     truncateAtWordBoundary(collapseWhitespace(toPlainText(row.content)), PRIOR_NOTE_SNIPPET_CHAR_LIMIT),
        })));
      }
    }
  } catch (e) {
    // Diagnosable, but never fatal.
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.warn(`Chronicle retrieval unavailable for campaign ${campaign_id}, falling back to the pre-#600 prompt: ${why}`);
    retrievedEntityBlock = "";
    priorChroniclesBlock = "";
  }

  // formatEntityBlock()/formatPriorChroniclesBlock() only format -- whether
  // to call them at all was decided above, so a zero-candidate retrieval
  // produces no prompt text at all rather than an empty ---BEGIN/END--- shell.
  const userContent = `${wrapUserInput(raw_text)}${retrievedEntityBlock}${priorChroniclesBlock}`;

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;

  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      maxTokens: textProvider === "anthropic" && anthropicKey ? 8192 : undefined,
      outputFormat: "text",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response(e.message, { status: 422 });
    }
    console.error("Chronicle text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "chronicle_text", textIsByok, chronicleTextCost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  }).catch(console.error);

  // The narrative is plain markdown now, but tolerate the legacy JSON wrapper
  // in case a model still emits it (the old system prompt asked for one).
  let chronicle = textResult.content;
  try {
    const parsed = JSON.parse(textResult.content) as { chronicle?: string };
    if (parsed && typeof parsed.chronicle === "string") chronicle = parsed.chronicle;
  } catch { /* plain markdown — use as-is */ }

  const ai_provenance: AiProvenance = {
    generatorType: "chronicle_text",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ chronicle, ai_provenance }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}));
