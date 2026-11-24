// A character answers in campaign chat while its player is away (#1021 row 26). No Deno and no Supabase in here;
// I/O comes in through `ReplyDeps`. Who answers and what they are told is `_shared/agent/standIn.ts`.
//
// The page that posted a chat line asks for this once, naming the line. Nothing the caller says is trusted beyond
// that id: the line, whom it addresses, who is played and who pays are all read on the server. The Dungeon Master
// pays ("players always play for free"), so every reply is reserved, charged and logged on the campaign owner.

import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import { creditsForUsd, usableCalibration, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { STAND_IN_MAX_OUTPUT_TOKENS, STAND_IN_REPLIES_MAX, standInPrompt, standInReply, standInsAnswering, type StandIn } from "../_shared/agent/standIn.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import { causeRequest, hasCause, namesInLine, unpromptedCandidates, unpromptedLeft, unpromptedPrompt, UNPROMPTED_WINDOW_MS, type KnownThings } from "./unprompted.ts";
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
  /** `unprompted` marks a line nobody asked for (`metadata.unprompted`), which is what the hourly cap counts. */
  postReply(reply: { line: ChatLine; character: StandIn; ownerId: string; text: string; recipientUserId: string | null; provider: string; model: string; unprompted: boolean }): Promise<void>;
  /** What the character knows by name beyond its own words: the rest of the party and the quests its player's character is on. */
  loadKnown(campaignId: string, partyMemberId: string): Promise<KnownThings>;
  /** How many unprompted lines the character has posted in this campaign since `sinceIso`. */
  countUnprompted(campaignId: string, partyMemberId: string, sinceIso: string): Promise<number>;
  /**
   * One judgment on the platform's own key, logged as platform-paid; null when there is no key (nothing is judged, so
   * nothing is said unasked). The line goes to a third party, so only the platform's key may be used.
   */
  judge(request: JudgeRequest): Promise<JudgeResult | null>;
  now(): number;
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

  const party = await deps.loadParty(campaign.id);
  const answered = new Set(await deps.answeredBy(line.id));
  const sender = { mentions: line.mentions, recipientUserId: line.recipient_user_id, senderUserId: line.user_id };
  const answering = standInsAnswering(sender, party).filter((c) => !answered.has(c.id));
  // Not addressed, not the sender's own, not already answered or spoken for this line: the ones who may speak up unasked.
  const bystanders = unpromptedCandidates(sender, party).filter((c) => !answered.has(c.id));
  if (answering.length === 0 && bystanders.length === 0) return nobody();
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
  const chosen = provider;
  const said = line;
  const whisper = line.recipient_user_id !== null;
  const recent = whisper ? [] : await deps.loadRecent(line);
  const from = line.sender_name ?? "Someone";
  let replies = 0;

  /** One character's line: held, written, screened by the shape of what came back, posted, charged, remembered. Null when the hold was refused. */
  async function speak(character: StandIn, how: { unprompted: false } | { unprompted: true; names: readonly string[]; memories: readonly string[] }): Promise<Response | null> {
    let ran = false;
    const answer = await deps.withHold(campaign.user_id, chosen.isByok ? 0 : REPLY_RESERVE_CREDITS, async (hold) => {
      ran = true;
      const memories = how.unprompted ? how.memories : await deps.loadMemories(campaign.id, character.id);
      const prompt = how.unprompted
        ? unpromptedPrompt({ character, memories, recent, line: { from, text: said.message }, names: how.names })
        : standInPrompt({ character, memories, recent, line: { from, text: said.message }, whisper });
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
        hold.charge(GENERATION, { cost: 0, isByok: chosen.isByok, log });
        return nobody();
      }
      // A whisper is answered in a whisper, back to the one who sent it. An unprompted line is only ever in the open.
      await deps.postReply({ line: said, character, ownerId: campaign.user_id, text: reply.says, recipientUserId: whisper ? said.user_id : null, provider: usage.provider, model: usage.model, unprompted: how.unprompted });
      replies += 1;
      const credits = chosen.isByok || !price || !calibration ? 0 : Math.max(1, Math.ceil(creditsForUsd(usdForSteps([usage], price), calibration)));
      hold.charge(GENERATION, { cost: credits, isByok: chosen.isByok, log });
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
    return ran ? null : answer;
  }

  for (const character of answering) {
    const refused = await speak(character, { unprompted: false });
    // The hold was refused (the DM is out of credits, or held back): its refusal is the answer, and the rest of the
    // party stays silent too.
    if (refused !== null) return refused;
  }

  // Speaking up unasked is never an error to the one who typed: every "no" from here is quiet.
  let room = STAND_IN_REPLIES_MAX - answering.length;
  for (const character of bystanders) {
    if (room <= 0) break;
    const memories = await deps.loadMemories(campaign.id, character.id);
    const names = namesInLine({ line: line.message, character, memories, known: await deps.loadKnown(campaign.id, character.id) });
    if (names.length === 0) continue;
    const spoken = await deps.countUnprompted(campaign.id, character.id, new Date(deps.now() - UNPROMPTED_WINDOW_MS).toISOString());
    if (unpromptedLeft(spoken) === 0) continue;
    let verdict: JudgeResult | null;
    try {
      verdict = await deps.judge(causeRequest({ character, line: { from, text: line.message }, names, recent }));
    } catch (e) {
      console.error("character-reply: the cause check failed:", e);
      continue;
    }
    // No platform key, or a judge that did not answer: nothing is said unasked.
    if (verdict === null) break;
    if (!hasCause(verdict)) continue;
    if ((await speak(character, { unprompted: true, names, memories })) !== null) break;
    room -= 1;
  }
  return nobody(replies);
}
