// A character answers in campaign chat while its player is away (#1021 row 26). No Deno and no Supabase in here;
// I/O comes in through `ReplyDeps`. Who answers and what they are told is `_shared/agent/standIn.ts`.
//
// The page that posted a chat line asks for this once, naming the line. Nothing the caller says is trusted beyond
// that id: the line, whom it addresses, who is played and who pays are all read on the server. The Dungeon Master
// pays ("players always play for free"), so every reply is reserved, charged and logged on the campaign owner.

import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import { creditsForUsd, usableCalibration, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { STAND_IN_MAX_OUTPUT_TOKENS, standInPrompt, standInReply, standInsAnswering, type StandIn } from "../_shared/agent/standIn.ts";
import type { AgentBlock } from "../_shared/agent/types.ts";
import type { StoredMention } from "../../../src/lib/chat/chatMentions.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";
import type { BaseCampaign, CampaignLoad } from "../_shared/pipeline/aiCampaign.ts";
import type { CreditHold } from "../_shared/pipeline/creditHold.ts";
import { json, jsonError } from "../_shared/pipeline/respond.ts";

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

export interface ReplyCampaign extends BaseCampaign {
  text_provider: string | null;
}

/** The ledger lines a reply may queue; the hold itself (reserve, release, write) is `withCreditHold`'s. */
export type ReplyHold = Pick<CreditHold, "charge" | "free">;
type UsageLog = { provider: string; model: string; input_tokens: number; output_tokens: number };

export interface ReplyDeps {
  loadLine(messageId: string): Promise<ChatLine | null>;
  /** The campaign, or the refusal to answer with: the caller must sit at it. */
  loadCampaign(campaignId: string, userId: string): Promise<CampaignLoad<ReplyCampaign>>;
  /** Whether the AI table is on for the campaign (`tableAiEnabled`). Off is a quiet "nobody answered", not a refusal. */
  aiOn(campaign: ReplyCampaign): Promise<boolean>;
  /** The party as the chat knows it, each with whose character it is and the two words that let it answer. */
  loadParty(campaignId: string): Promise<StandIn[]>;
  /** The characters that have already answered this line: asking twice answers once. */
  answeredBy(messageId: string): Promise<string[]>;
  /** The Dungeon Master's own account may not generate (suspended, a child account): nobody is played. */
  ownerRefused(ownerId: string): Promise<boolean>;
  /** Whether the screen refuses the line. Logged against the one who typed it. */
  isFlagged(text: string, senderId: string): Promise<boolean>;
  resolveProvider(campaign: ReplyCampaign): Promise<AgentProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  loadMemories(campaignId: string, partyMemberId: string): Promise<string[]>;
  /** The newest public chat lines before this one, oldest first. Whispers are never among them. */
  loadRecent(line: ChatLine): Promise<{ from: string; text: string }[]>;
  /**
   * Holds `credits` on the campaign owner's account (0 holds nothing: own-key play), runs one character's reply and
   * releases the hold whatever happens. A refused hold answers its refusal without running `work`.
   */
  withHold(ownerId: string, credits: number, work: (hold: ReplyHold) => Promise<Response>): Promise<Response>;
  postReply(reply: { line: ChatLine; character: StandIn; ownerId: string; text: string; recipientUserId: string | null; provider: string; model: string }): Promise<void>;
  fileMemory(memory: { campaignId: string; partyMemberId: string; ownerId: string; body: string; provider: string; model: string }): Promise<void>;
}

/** Held per reply while it is written: a chat line costs a fraction of a turn of the story. */
export const REPLY_RESERVE_CREDITS = 1;
/** The ledger reason every reply is held and charged under. */
export const GENERATION = "character_reply";

export const REPLY_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That message was not found.",
} as const;

/** "Nobody answered": the line was posted, and whether a character answers is not the sender's business. */
const nobody = (replies = 0) => json({ replies });

export async function answerChatLine(input: { userId: string; body: unknown; deps: ReplyDeps }): Promise<Response> {
  const { userId, deps } = input;
  const raw = input.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return jsonError(400, "invalid_body", REPLY_MESSAGES.badBody);
  const messageId = (raw as Record<string, unknown>).messageId;
  if (typeof messageId !== "string" || !UUID_RE.test(messageId)) return jsonError(400, "invalid_body", REPLY_MESSAGES.badBody);

  // Only the one who typed a line may ask for its answer: nobody replays someone else's line at the DM's cost,
  // and a line the caller cannot have written is "not found", not "forbidden".
  const line = await deps.loadLine(messageId);
  if (!line || line.user_id !== userId || line.type !== "chat") return jsonError(404, "message_not_found", REPLY_MESSAGES.notFound);
  const load = await deps.loadCampaign(line.campaign_id, userId);
  if (!load.ok) return load.response;
  const campaign = load.campaign;
  // From here every "no" is quiet: the line was posted, and whether a character answers is not the sender's business.
  // AI off included: the chat asks on every line a stand-in might answer.
  if (!(await deps.aiOn(campaign))) return nobody();

  const answered = new Set(await deps.answeredBy(line.id));
  const answering = standInsAnswering(
    { mentions: line.mentions, recipientUserId: line.recipient_user_id, senderUserId: line.user_id },
    await deps.loadParty(campaign.id),
  ).filter((c) => !answered.has(c.id));
  if (answering.length === 0) return nobody();
  if (await deps.ownerRefused(campaign.user_id)) return nobody();
  if (await deps.isFlagged(line.message, line.user_id)) return nobody();

  const provider = await deps.resolveProvider(campaign);
  if (!provider || !provider.callModel) return nobody();
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    price = await deps.loadPrice(provider.model);
    const found = await deps.loadCalibration();
    calibration = usableCalibration(found);
    if (!price || !calibration) return nobody();
  }

  const callModel = provider.callModel;
  const whisper = line.recipient_user_id !== null;
  const recent = whisper ? [] : await deps.loadRecent(line);
  const from = line.sender_name ?? "Someone";
  let replies = 0;
  for (const character of answering) {
    let ran = false;
    const answer = await deps.withHold(campaign.user_id, provider.isByok ? 0 : REPLY_RESERVE_CREDITS, async (hold) => {
      ran = true;
      const prompt = standInPrompt({ character, memories: await deps.loadMemories(campaign.id, character.id), recent, line: { from, text: line.message }, whisper });
      const step = await callModel({
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
        hold.charge(GENERATION, { cost: 0, isByok: provider.isByok, log });
        return nobody();
      }
      // A whisper is answered in a whisper, back to the one who sent it.
      await deps.postReply({ line, character, ownerId: campaign.user_id, text: reply.says, recipientUserId: whisper ? line.user_id : null, provider: usage.provider, model: usage.model });
      replies += 1;
      const credits = provider.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
      hold.charge(GENERATION, { cost: credits, isByok: provider.isByok, log });
      if (reply.remembers !== null) {
        // A memory is a nicety: failing to file it must not turn a posted, paid reply into an error.
        try {
          await deps.fileMemory({ campaignId: campaign.id, partyMemberId: character.id, ownerId: campaign.user_id, body: reply.remembers, provider: usage.provider, model: usage.model });
        } catch (e) {
          console.error("character memory not filed:", e);
        }
      }
      return nobody();
    });
    // The hold was refused (the DM is out of credits, or held back): its refusal is the answer, and the rest of the
    // party stays silent too.
    if (!ran) return answer;
  }
  return nobody(replies);
}
