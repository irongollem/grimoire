// A character answers in campaign chat while its player is away (#1021 row 26). No Deno and no Supabase in here;
// I/O comes in through `ReplyDeps`. Who answers and what they are told is `_shared/agent/standIn.ts`.
//
// The page that posted a chat line asks for this once, naming the line. Nothing the caller says is trusted beyond
// that id: the line, whom it addresses, who is played and who pays are all read on the server. The Dungeon Master
// pays ("players always play for free"), so every reply is reserved, charged and logged on the campaign owner.

import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { STAND_IN_MAX_OUTPUT_TOKENS, standInPrompt, standInReply, standInsAnswering, type StandIn } from "../_shared/agent/standIn.ts";
import type { AgentBlock, CallModel } from "../_shared/agent/types.ts";
import type { StoredMention } from "../../../src/lib/chat/chatMentions.ts";

export interface ChatLine {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_user_id: string | null;
  type: string;
  sender_name: string | null;
  message: string;
  mentions: StoredMention[];
}

export interface ReplyCampaign {
  id: string;
  /** The campaign's owner: the Dungeon Master who pays. */
  user_id: string;
  ai_enabled: boolean | null;
}

type Reservation = { ok: true; ids: string[] } | { ok: false; status: number; error: string };
type UsageLog = { provider: string; model: string; input_tokens: number; output_tokens: number };

export interface ReplyDeps {
  loadLine(messageId: string): Promise<ChatLine | null>;
  loadCampaign(campaignId: string): Promise<ReplyCampaign | null>;
  /** The party as the chat knows it, each with whose character it is and the two words that let it answer. */
  loadParty(campaignId: string): Promise<StandIn[]>;
  /** The characters that have already answered this line: asking twice answers once. */
  answeredBy(messageId: string): Promise<string[]>;
  /** The Dungeon Master's own account may not generate (suspended, a child account): nobody is played. */
  ownerRefused(ownerId: string): Promise<boolean>;
  /** Whether the screen refuses the line. Logged against the one who typed it. */
  isFlagged(text: string, senderId: string): Promise<boolean>;
  resolveProvider(campaign: ReplyCampaign): Promise<{ provider: string; model: string; isByok: boolean; callModel: CallModel | null } | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  loadMemories(campaignId: string, partyMemberId: string): Promise<string[]>;
  /** The newest public chat lines before this one, oldest first. Whispers are never among them. */
  loadRecent(line: ChatLine): Promise<{ from: string; text: string }[]>;
  reserve(ownerId: string, credits: number): Promise<Reservation>;
  release(ids: string[]): Promise<void>;
  postReply(reply: { line: ChatLine; character: StandIn; text: string; recipientUserId: string | null; provider: string; model: string }): Promise<void>;
  fileMemory(memory: { campaignId: string; partyMemberId: string; ownerId: string; body: string; provider: string; model: string }): Promise<void>;
  charge(ownerId: string, isByok: boolean, credits: number, log: UsageLog): Promise<void>;
  logUncharged(ownerId: string, isByok: boolean, log: UsageLog): Promise<void>;
}

/** Held per reply while it is written: a chat line costs a fraction of a turn of the story. */
export const REPLY_RESERVE_CREDITS = 1;

export const REPLY_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That message was not found.",
} as const;

export type ReplyOutcome = { ok: false; status: number; error: string } | { ok: true; replies: number };

const refuse = (status: number, error: string): ReplyOutcome => ({ ok: false, status, error });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOBODY: ReplyOutcome = { ok: true, replies: 0 };

export async function answerChatLine(input: { userId: string; body: unknown; deps: ReplyDeps }): Promise<ReplyOutcome> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse(400, REPLY_MESSAGES.badBody);
  const messageId = (raw as Record<string, unknown>).messageId;
  if (typeof messageId !== "string" || !UUID_RE.test(messageId)) return refuse(400, REPLY_MESSAGES.badBody);

  // Only the one who typed a line may ask for its answer: nobody replays someone else's line at the DM's cost,
  // and a line the caller cannot have written is "not found", not "forbidden".
  const line = await deps.loadLine(messageId);
  if (!line || line.user_id !== userId || line.type !== "chat") return refuse(404, REPLY_MESSAGES.notFound);
  const campaign = await deps.loadCampaign(line.campaign_id);
  if (!campaign) return refuse(404, REPLY_MESSAGES.notFound);
  // From here every "no" is quiet: the line was posted, and whether a character answers is not the sender's business.
  if (campaign.ai_enabled === false) return NOBODY;

  const answered = new Set(await deps.answeredBy(line.id));
  const answering = standInsAnswering(
    { mentions: line.mentions, recipientUserId: line.recipient_user_id, senderUserId: line.user_id },
    await deps.loadParty(campaign.id),
  ).filter((c) => !answered.has(c.id));
  if (answering.length === 0) return NOBODY;
  if (await deps.ownerRefused(campaign.user_id)) return NOBODY;
  if (await deps.isFlagged(line.message, line.user_id)) return NOBODY;

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return NOBODY;
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    price = await deps.loadPrice(provider.model);
    const found = await deps.loadCalibration();
    if (found && found.usdPerCredit !== null && Number.isFinite(found.usdPerCredit) && found.usdPerCredit > 0 && Number.isFinite(found.margin) && found.margin > 0) {
      calibration = { usdPerCredit: found.usdPerCredit, margin: found.margin };
    }
    if (!price || !calibration) return NOBODY;
  }

  const whisper = line.recipient_user_id !== null;
  const recent = whisper ? [] : await deps.loadRecent(line);
  const from = line.sender_name ?? "Someone";
  let replies = 0;
  for (const character of answering) {
    let reservationIds: string[] = [];
    if (!provider.isByok) {
      const reservation = await deps.reserve(campaign.user_id, REPLY_RESERVE_CREDITS);
      // The DM is out of credits (or held back): the rest of the party stays silent too.
      if (!reservation.ok) break;
      reservationIds = reservation.ids;
    }
    try {
      const prompt = standInPrompt({ character, memories: await deps.loadMemories(campaign.id, character.id), recent, line: { from, text: line.message }, whisper });
      const step = await provider.callModel({
        system: prompt.system,
        messages: [{ role: "user", blocks: [{ type: "text", text: prompt.user }] }],
        tools: [],
        maxOutputTokens: STAND_IN_MAX_OUTPUT_TOKENS,
      });
      const usage = step.usage;
      const log: UsageLog = { provider: usage.provider, model: usage.model, input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, output_tokens: usage.outputTokens };
      const text = step.stop === "refusal" ? "" : step.blocks.filter((b): b is Extract<AgentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
      const reply = standInReply(text);
      if (reply === null) {
        await deps.logUncharged(campaign.user_id, provider.isByok, log);
        continue;
      }
      // A whisper is answered in a whisper, back to the one who sent it.
      await deps.postReply({ line, character, text: reply.says, recipientUserId: whisper ? line.user_id : null, provider: usage.provider, model: usage.model });
      replies += 1;
      const credits = provider.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
      await deps.charge(campaign.user_id, provider.isByok, credits, log);
      if (reply.remembers !== null) {
        await deps.fileMemory({ campaignId: campaign.id, partyMemberId: character.id, ownerId: campaign.user_id, body: reply.remembers, provider: usage.provider, model: usage.model });
      }
    } finally {
      await deps.release(reservationIds);
    }
  }
  return { ok: true, replies };
}
