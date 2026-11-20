// A sitting told as a story (#1021 row 19). No Deno and no Supabase in here; I/O comes in through `RecapDeps`.
//
// The Dungeon Master asks for it from the note a sitting left; one model call writes the telling from what the
// player saw (`_shared/agent/recap.ts`), it is put in the note above the facts, and it is charged like any call
// that succeeded. A note the Dungeon Master has since rewritten by hand is not overwritten.

import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import { creditsForUsd, usableCalibration, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { recapDocument, shownStory, tellRecap } from "../_shared/agent/recap.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";
import type { BaseCampaign, CampaignLoad } from "../_shared/pipeline/aiCampaign.ts";
import type { CreditHold } from "../_shared/pipeline/creditHold.ts";
import { json, jsonError } from "../_shared/pipeline/respond.ts";

export interface RecapNote {
  id: string;
  campaign_id: string | null;
  /** The AI mark on the note: which generator made it, and whether a person has edited it since. */
  generatorType: string | null;
  edited: boolean;
}

export interface RecapSitting {
  id: string;
  summary: string | null;
  summary_through_seq: number;
  party_member_id: string | null;
}

export interface RecapCampaign extends BaseCampaign {
  text_provider: string | null;
}

/** The ledger lines a telling may queue; the hold itself (reserve, release, write) is `withCreditHold`'s. */
export type RecapHold = Pick<CreditHold, "charge" | "free">;

export interface RecapDeps {
  loadNote(noteId: string): Promise<RecapNote | null>;
  /** The campaign, or the refusal to answer with: a caller who is not its DM is told it does not exist, and AI must be on. */
  loadCampaign(campaignId: string, userId: string): Promise<CampaignLoad<RecapCampaign>>;
  /** The caller's own sitting that left this note; null when there is none. */
  loadSitting(noteId: string, userId: string): Promise<RecapSitting | null>;
  loadTurns(sittingId: string, summaryThroughSeq: number): Promise<StoredTurn[]>;
  /** Every fact the sitting filed; the handler keeps only what the party knows. */
  loadFacts(sittingId: string): Promise<Array<{ body: string; known_to_player: boolean }>>;
  characterName(campaignId: string, characterId: string): Promise<string | null>;
  resolveProvider(campaign: RecapCampaign): Promise<AgentProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  /** Holds `credits` (0 holds nothing: own-key play), runs the telling and releases the hold whatever happens. */
  withHold(credits: number, work: (hold: RecapHold) => Promise<Response>): Promise<Response>;
  /** Puts the telling in the note. */
  writeNote(noteId: string, content: string): Promise<void>;
}

/** Held while the telling is written; a recap costs about what a turn of the story costs. */
export const RECAP_RESERVE_CREDITS = 3;
/** The mark `agent-leave` puts on the note a sitting leaves. */
export const TABLE_NOTE_GENERATOR = "agent_table_record";

export const RECAP_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That note was not found.",
  notATableNote: "This note was not left by a sitting at the AI table, so there is no sitting to tell.",
  edited: "This note has been rewritten by hand. Telling the sitting again would replace your words, so it is left as it is.",
  nothing: "Nothing happened at that sitting that could be told.",
  noProvider: "No AI provider is set up for this campaign.",
  noMetering: "The telling cannot be metered right now.",
  noStory: "The model did not write a telling. Nothing was charged.",
} as const;

export async function tellSitting(input: { userId: string; body: unknown; deps: RecapDeps }): Promise<Response> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return jsonError(400, "invalid_body", RECAP_MESSAGES.badBody);
  const noteId = (raw as Record<string, unknown>).noteId;
  if (typeof noteId !== "string" || !UUID_RE.test(noteId)) return jsonError(400, "invalid_body", RECAP_MESSAGES.badBody);

  const note = await deps.loadNote(noteId);
  if (!note || note.campaign_id === null) return jsonError(404, "note_not_found", RECAP_MESSAGES.notFound);
  const load = await deps.loadCampaign(note.campaign_id, userId);
  if (!load.ok) return load.response;
  const campaign = load.campaign;
  if (note.generatorType !== TABLE_NOTE_GENERATOR) return jsonError(422, "not_a_table_note", RECAP_MESSAGES.notATableNote);
  if (note.edited) return jsonError(409, "note_edited", RECAP_MESSAGES.edited);
  const sitting = await deps.loadSitting(note.id, userId);
  if (sitting === null) return jsonError(422, "not_a_table_note", RECAP_MESSAGES.notATableNote);

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return jsonError(503, "no_provider", RECAP_MESSAGES.noProvider);
  const callModel = provider.callModel;
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    price = await deps.loadPrice(provider.model);
    const found = await deps.loadCalibration();
    calibration = usableCalibration(found);
    if (!price || !calibration) return jsonError(503, "metering_unavailable", RECAP_MESSAGES.noMetering);
  }

  const name = sitting.party_member_id === null ? null : await deps.characterName(campaign.id, sitting.party_member_id);
  const playerName = name ?? "The player's character";
  const lines = shownStory(await deps.loadTurns(sitting.id, sitting.summary_through_seq), playerName);
  // A hidden fact is the narrator's secret: it is no part of notes the players read and hear.
  const facts = (await deps.loadFacts(sitting.id)).filter((f) => f.known_to_player).map((f) => f.body);
  if (lines.length === 0 && facts.length === 0) return jsonError(422, "nothing_to_tell", RECAP_MESSAGES.nothing);

  return deps.withHold(provider.isByok ? 0 : RECAP_RESERVE_CREDITS, async (hold) => {
    const { story, usage } = await tellRecap({ callModel, earlier: sitting.summary, lines, facts, playerName });
    const log = { provider: usage.provider, model: usage.model, input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, output_tokens: usage.outputTokens };
    if (story === null) {
      // The call was paid for by us and nothing came of it: logged, not charged.
      hold.charge("agent_recap", { cost: 0, isByok: provider.isByok, log });
      return jsonError(502, "generation_failed", RECAP_MESSAGES.noStory);
    }
    await deps.writeNote(note.id, recapDocument(story, facts));
    // Whole credits, at least one: a telling that was written and kept is one charge. Own-key play is logged, not charged.
    const credits = provider.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
    hold.charge("agent_recap", { cost: credits, isByok: provider.isByok, log });
    return json({ told: true, credits });
  });
}
