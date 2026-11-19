// A sitting told as a story (#1021 row 19). No Deno and no Supabase in here; I/O comes in through `RecapDeps`.
//
// The Dungeon Master asks for it from the note a sitting left; one model call writes the telling from what the
// player saw (`_shared/agent/recap.ts`), it is put in the note above the facts, and it is charged like any call
// that succeeded. A note the Dungeon Master has since rewritten by hand is not overwritten.

import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { recapDocument, shownStory, tellRecap } from "../_shared/agent/recap.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import type { CallModel } from "../_shared/agent/types.ts";

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

export interface RecapCampaign {
  id: string;
  user_id: string;
  ai_enabled: boolean | null;
}

type Reservation = { ok: true; ids: string[] } | { ok: false; status: number; error: string };

export interface RecapDeps {
  loadNote(noteId: string): Promise<RecapNote | null>;
  loadCampaign(campaignId: string): Promise<RecapCampaign | null>;
  isDm(campaign: RecapCampaign, userId: string): Promise<boolean>;
  /** The caller's own sitting that left this note; null when there is none. */
  loadSitting(noteId: string, userId: string): Promise<RecapSitting | null>;
  loadTurns(sittingId: string, summaryThroughSeq: number): Promise<StoredTurn[]>;
  /** Every fact the sitting filed; the handler keeps only what the party knows. */
  loadFacts(sittingId: string): Promise<Array<{ body: string; known_to_player: boolean }>>;
  characterName(campaignId: string, characterId: string): Promise<string | null>;
  resolveProvider(campaign: RecapCampaign): Promise<{ provider: string; model: string; isByok: boolean; callModel: CallModel | null } | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  reserve(userId: string, credits: number): Promise<Reservation>;
  release(ids: string[]): Promise<void>;
  /** Puts the telling in the note. */
  writeNote(noteId: string, content: string): Promise<void>;
  charge(userId: string, isByok: boolean, credits: number, log: { provider: string; model: string; input_tokens: number; output_tokens: number }): Promise<void>;
  /** The call was paid for by us and nothing came of it: logged, not charged. */
  logUncharged(userId: string, isByok: boolean, log: { provider: string; model: string; input_tokens: number; output_tokens: number }): Promise<void>;
}

/** Held while the telling is written; a recap costs about what a turn of the story costs. */
export const RECAP_RESERVE_CREDITS = 3;
/** The mark `agent-leave` puts on the note a sitting leaves. */
export const TABLE_NOTE_GENERATOR = "agent_table_record";

export const RECAP_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That note was not found.",
  notDm: "Only the Dungeon Master has a sitting told as a story.",
  aiOff: "AI is disabled for this campaign.",
  notATableNote: "This note was not left by a sitting at the AI table, so there is no sitting to tell.",
  edited: "This note has been rewritten by hand. Telling the sitting again would replace your words, so it is left as it is.",
  nothing: "Nothing happened at that sitting that could be told.",
  noProvider: "No AI provider is set up for this campaign.",
  noMetering: "The telling cannot be metered right now.",
  noStory: "The model did not write a telling. Nothing was charged.",
} as const;

export type RecapOutcome = { ok: false; status: number; error: string } | { ok: true; credits: number };

const refuse = (status: number, error: string): RecapOutcome => ({ ok: false, status, error });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function tellSitting(input: { userId: string; body: unknown; deps: RecapDeps }): Promise<RecapOutcome> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse(400, RECAP_MESSAGES.badBody);
  const noteId = (raw as Record<string, unknown>).noteId;
  if (typeof noteId !== "string" || !UUID_RE.test(noteId)) return refuse(400, RECAP_MESSAGES.badBody);

  const note = await deps.loadNote(noteId);
  if (!note || note.campaign_id === null) return refuse(404, RECAP_MESSAGES.notFound);
  const campaign = await deps.loadCampaign(note.campaign_id);
  // Someone who is not this campaign's DM is told the note does not exist: a 403 would say it does.
  if (!campaign || !(await deps.isDm(campaign, userId))) return refuse(404, RECAP_MESSAGES.notFound);
  if (campaign.ai_enabled === false) return refuse(403, RECAP_MESSAGES.aiOff);
  if (note.generatorType !== TABLE_NOTE_GENERATOR) return refuse(422, RECAP_MESSAGES.notATableNote);
  if (note.edited) return refuse(409, RECAP_MESSAGES.edited);
  const sitting = await deps.loadSitting(note.id, userId);
  if (sitting === null) return refuse(422, RECAP_MESSAGES.notATableNote);

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return refuse(503, RECAP_MESSAGES.noProvider);
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    price = await deps.loadPrice(provider.model);
    const found = await deps.loadCalibration();
    if (found && found.usdPerCredit !== null && Number.isFinite(found.usdPerCredit) && found.usdPerCredit > 0 && Number.isFinite(found.margin) && found.margin > 0) {
      calibration = { usdPerCredit: found.usdPerCredit, margin: found.margin };
    }
    if (!price || !calibration) return refuse(503, RECAP_MESSAGES.noMetering);
  }

  const name = sitting.party_member_id === null ? null : await deps.characterName(campaign.id, sitting.party_member_id);
  const playerName = name ?? "The player's character";
  const lines = shownStory(await deps.loadTurns(sitting.id, sitting.summary_through_seq), playerName);
  // A hidden fact is the narrator's secret: it is no part of notes the players read and hear.
  const facts = (await deps.loadFacts(sitting.id)).filter((f) => f.known_to_player).map((f) => f.body);
  if (lines.length === 0 && facts.length === 0) return refuse(422, RECAP_MESSAGES.nothing);

  let reservationIds: string[] = [];
  if (!provider.isByok) {
    const reservation = await deps.reserve(userId, RECAP_RESERVE_CREDITS);
    if (!reservation.ok) return refuse(reservation.status, reservation.error);
    reservationIds = reservation.ids;
  }
  try {
    const { story, usage } = await tellRecap({ callModel: provider.callModel, earlier: sitting.summary, lines, facts, playerName });
    const log = { provider: usage.provider, model: usage.model, input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, output_tokens: usage.outputTokens };
    if (story === null) {
      await deps.logUncharged(userId, provider.isByok, log);
      return refuse(502, RECAP_MESSAGES.noStory);
    }
    await deps.writeNote(note.id, recapDocument(story, facts));
    // Whole credits, at least one: a telling that was written and kept is one charge. Own-key play is logged, not charged.
    const credits = provider.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
    await deps.charge(userId, provider.isByok, credits, log);
    return { ok: true, credits };
  } finally {
    await deps.release(reservationIds);
  }
}
