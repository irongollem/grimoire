// What a turn does around the loop: reading the scene and the record for the system text, folding old messages into
// the summary, and the two small helpers both use. Split from `handler.ts` so the handler holds the turn's rules.

import { budgetLine, type TurnBudget } from "../_shared/agent/fightChange.ts";
import { peoplesSection } from "../_shared/agent/peoples.ts";
import { fightsSection, NO_FIGHTS, type FightsInView } from "../_shared/agent/fight.ts";
import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { planSummary, summarise } from "../_shared/agent/summary.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import { sceneSection, trimScene, type TrimmedScene } from "../_shared/agent/scene.ts";
import { recordSection, type RecordedFact } from "../_shared/agent/record.ts";
import { CANON_GUIDE, canonHereSection, NO_CANON_HERE, previouslySection, type CanonHere } from "../_shared/agent/canon.ts";
import { memoriesSection, type SceneMemory } from "../_shared/agent/memories.ts";
import { inventionsSection, type PendingInvention } from "../_shared/agent/invention.ts";
import { NO_SITE, siteSection, type SiteState } from "../_shared/agent/site.ts";
import { todaySection } from "../_shared/agent/today.ts";
import { playerCharacterSection, type PlayerCharacter } from "../_shared/agent/playerCharacter.ts";
import { rulesetLabelFor, soloTableSystem } from "../_shared/agent/soloTablePrompt.ts";
import type { DatePoint } from "../_shared/npcAge.ts";
import { NO_QUESTS, pressureIsSpent, pressureTick, questsSection, type QuestMove, type QuestsInPlay } from "../_shared/agent/quests.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import type { AgentTurnDeps, CampaignRow, SessionRow, TurnLedger } from "./turnTypes.ts";

// The session's credits hold six decimals; accruing at the same precision keeps what is sent equal to what is stored.
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** The party's place for the system text. A place that will not load is no place: the turn still runs. */
export async function sceneOf(deps: AgentTurnDeps, campaignId: string, locationId: string | null) {
  if (locationId === null) return null;
  try {
    const view = await deps.loadScene(campaignId, locationId);
    return view ? trimScene(view) : null;
  } catch (error) {
    console.error("agent-turn: loading the scene failed:", error);
    return null;
  }
}

/** What is on record for the place and the people in it. A record that will not load is an empty one: the turn still runs. */
export async function recordOf(deps: AgentTurnDeps, campaignId: string, scene: TrimmedScene | null): Promise<RecordedFact[]> {
  try {
    return await deps.loadRecord(campaignId, {
      locationId: scene ? scene.id : null,
      characterIds: scene ? scene.characters.map((c) => c.id) : [],
    });
  } catch (error) {
    console.error("agent-turn: loading the record failed:", error);
    return [];
  }
}

/** The character the conversation is played as. One that will not load is no character: the turn still runs without it. */
export async function characterOf(deps: AgentTurnDeps, campaignId: string, characterId: string | null): Promise<PlayerCharacter | null> {
  if (characterId === null) return null;
  try {
    return await deps.loadCharacter(campaignId, characterId);
  } catch (error) {
    console.error("agent-turn: loading the player's character failed:", error);
    return null;
  }
}

/**
 * The instructions: the standing rules, the campaign and the player's character, and nothing that changes from turn
 * to turn. The provider's prompt cache keeps nothing of a request whose instructions differ from the last one's by
 * a single sentence, so everything that moves during play is in `stateFor` instead. The summary is added by the
 * caller; it changes only when older turns are folded into it, and the history is cut at that moment anyway.
 */
export function systemFor(input: {
  campaign: CampaignRow;
  character: PlayerCharacter | null;
  peoples: readonly string[];
  /** The world block (premise, tone, lines and veils, the truths known to all), already worded; empty when the campaign has none or it could not be read. */
  world?: string;
  /** An excerpt of the last sitting's chronicle entry; empty with no earlier sitting. */
  previously?: string;
}): string {
  const { campaign } = input;
  const parts = [soloTableSystem({ id: campaign.id, name: campaign.name, rulesetLabel: rulesetLabelFor(campaign.game_system), violence: campaign.table_violence })];
  // The canon (#1226): what is always carried, short. The rest is looked up (`canon_lookup`) or shown where the party stands.
  if (input.world !== undefined && input.world !== "") parts.push(input.world);
  parts.push(CANON_GUIDE);
  // The world's own kinds of folk: a campaign's list changes about as often as its name, so it sits with it.
  const peoples = peoplesSection(input.peoples);
  if (peoples !== "") parts.push(peoples);
  const previously = previouslySection(input.previously ?? "");
  if (previously !== "") parts.push(previously);
  if (input.character) parts.push(playerCharacterSection(input.character));
  return parts.join("\n\n");
}

/**
 * Where things stand this turn: the scene (changes when the party moves or someone joins it), the quests (a mark, a
 * clock tick) and the record (a fact filed). Sent at the head of the player's newest message, never stored, so a
 * change here costs the cache only what follows it.
 */
export function stateFor(input: {
  scene: TrimmedScene | null;
  quests: QuestsInPlay | null;
  record: RecordedFact[];
  fights: FightsInView | null;
  /** What the player's turn in the fight still holds, as the page told it; null outside a fight or when it did not say. */
  fightTurn?: TurnBudget | null;
  /** What the played character carries and the place sells, already worded; empty when nobody is played or it could not be read. */
  possessions?: string;
  /** The handouts still to be handed over, already worded; empty when there are none or nobody is played. */
  handouts?: string;
  /** The weather where the party stands, already worded; empty when the page sent none. */
  sky?: string;
  /** The rest of the party, already worded; empty with nobody else. */
  companions?: string;
  /** What the canon holds where the party stands (#1226): clues, lore, who may say what, what is kept open. */
  canon?: CanonHere;
  /** The campaign's date as its calendar names it; absent with no date set. */
  today?: string | null;
  /** What has become true of the party's place and its rooms; absent when nothing is marked or it could not be read. */
  site?: SiteState;
  /** What the characters here remember of the party; absent when none do or it could not be read. */
  memories?: readonly SceneMemory[];
  /** The played character's inventions waiting on a ruling; absent when none or nobody is played. */
  inventions?: readonly PendingInvention[];
}): string {
  // The fights sit with the scene: they are about the place the party stands in. Nothing to say, no section.
  const fights = fightsSection(input.fights ?? NO_FIGHTS, input.fightTurn ? budgetLine(input.fightTurn) : null);
  const carried = input.possessions === undefined || input.possessions === "" ? [] : [input.possessions];
  const handouts = input.handouts === undefined || input.handouts === "" ? [] : [input.handouts];
  const sky = input.sky === undefined || input.sky === "" ? [] : [input.sky];
  const companions = input.companions === undefined || input.companions === "" ? [] : [input.companions];
  const canon = canonHereSection(input.canon ?? NO_CANON_HERE);
  const today = todaySection(input.today);
  const site = siteSection(input.site ?? NO_SITE);
  const memories = memoriesSection(input.memories ?? []);
  const inventions = inventionsSection(input.inventions ?? []);
  const optional = (text: string) => (text === "" ? [] : [text]);
  return [sceneSection(input.scene), ...optional(today), ...optional(site), ...optional(memories), ...optional(inventions), ...companions, ...sky, ...(fights === "" ? [] : [fights]), ...carried, ...handouts, questsSection(input.quests ?? NO_QUESTS), ...(canon === "" ? [] : [canon]), recordSection(input.record)].join("\n\n");
}

/** What is marked true of the party's place and its rooms. A read that fails is no state: the turn still runs. */
export async function siteOf(deps: AgentTurnDeps, campaignId: string, locationId: string | null): Promise<SiteState> {
  if (locationId === null) return NO_SITE;
  try {
    return await deps.loadSiteState(campaignId, locationId);
  } catch (error) {
    console.error("agent-turn: reading the site state failed:", error);
    return NO_SITE;
  }
}

/** What the characters in the scene remember of the party. A read that fails is no memories: the turn still runs. */
export async function memoriesOf(deps: AgentTurnDeps, campaignId: string, scene: TrimmedScene | null): Promise<SceneMemory[]> {
  if (scene === null || scene.characters.length === 0) return [];
  try {
    return await deps.loadSceneMemories(campaignId, scene.characters.map((c) => c.id));
  } catch (error) {
    console.error("agent-turn: reading what the characters remember failed:", error);
    return [];
  }
}

/** The played character's inventions waiting on a ruling. A read that fails is none: the turn still runs, with no ruling to make. */
export async function inventionsOf(deps: AgentTurnDeps, campaignId: string, memberId: string | null): Promise<PendingInvention[]> {
  if (memberId === null) return [];
  try {
    return await deps.loadPendingInventions(campaignId, memberId);
  } catch (error) {
    console.error("agent-turn: reading the inventions waiting on a ruling failed:", error);
    return [];
  }
}

/** The fights for this turn. Null when they could not be read: the turn still runs, with no fight tool. */
export async function fightsOf(
  deps: AgentTurnDeps,
  campaignId: string,
  locationId: string | null,
  fightEncounterId: string | null,
  pursuitEncounterId: string | null = null,
): Promise<FightsInView | null> {
  try {
    return await deps.loadFights(campaignId, locationId, fightEncounterId, pursuitEncounterId);
  } catch (error) {
    console.error("agent-turn: loading the fights failed:", error);
    return null;
  }
}

/**
 * The quests in play for this turn. Null when they could not be read: the turn still runs, but then no quest tool is
 * offered, because the ids it would be asked to name could not be checked.
 */
export async function questsOf(deps: AgentTurnDeps, campaignId: string, pressureClockId: string | null): Promise<QuestsInPlay | null> {
  try {
    return await deps.loadQuests(campaignId, pressureClockId);
  } catch (error) {
    console.error("agent-turn: loading the quests failed:", error);
    return null;
  }
}

/**
 * Applies a kept turn's quest moves in the order the narrator made them, then the server's own tick of the pressure
 * clock. Each move is its own `safely`: one that fails is logged and costs that move, never the turn or the moves after it.
 */
export async function applyKeptQuestMoves(input: {
  deps: AgentTurnDeps;
  ctx: { campaignId: string; agentSessionId: string; today?: DatePoint | null };
  state: QuestsInPlay;
  queued: readonly QuestMove[];
}): Promise<void> {
  const { deps, ctx } = input;
  for (const move of input.queued) await safely(() => deps.applyQuestMove(ctx, move));
  const tick = pressureTick(input.state, input.queued);
  if (tick !== null) await safely(() => deps.applyQuestMove(ctx, tick));
  // A clock that is now full has done its work: the conversation lets go of it (and a clock the table made goes).
  if (pressureIsSpent(input.state, input.queued)) await safely(() => deps.applyQuestMove(ctx, { kind: "pressure", mode: "stop" }));
}

/**
 * Folds the older messages into the session's summary when the conversation has grown. It runs after the turn has
 * been saved, charged and reported, so whatever happens in here, the player already has their answer: everything
 * thrown is logged and nothing is emitted.
 */
export async function foldIntoSummary(input: {
  deps: AgentTurnDeps;
  ledger: TurnLedger;
  session: SessionRow;
  storedNow: StoredTurn[];
  callModel: CallModel;
  isByok: boolean;
  price: ModelPrice | null;
  calibration: CreditCalibration | null;
}): Promise<void> {
  const { deps, session, isByok } = input;
  try {
    const plan = planSummary(input.storedNow, session.summary_through_seq);
    if (!plan) return;

    const { summary, usage } = await summarise({
      callModel: input.callModel,
      previousSummary: session.summary,
      fold: plan.fold,
    });
    const logFields: CreditLogFields = {
      model: usage.model,
      provider: usage.provider,
      input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
      output_tokens: usage.outputTokens,
    };
    const logWithoutCharge = async () => input.ledger.charge("agent_turn", { cost: 0, isByok, log: logFields });

    // Nothing to store and nothing to bill, but the provider was paid for the call, so the tokens are logged.
    if (summary === null) {
      await safely(logWithoutCharge);
      return;
    }

    let credits = 0;
    if (!isByok && input.price && input.calibration) {
      credits = round6(creditsForUsd(usdForSteps([usage], input.price), input.calibration));
    }
    // Like a turn: a summary that was not kept is not billed, but its tokens were spent and are logged.
    let saved: { due: number } | "stale" | "failed";
    try {
      saved = await deps.saveSummary({
        sessionId: session.id,
        expectedThroughSeq: session.summary_through_seq,
        throughSeq: plan.throughSeq,
        summary,
        usage,
        credits,
      });
    } catch (error) {
      console.error("agent-turn: saving the summary failed:", error);
      saved = "failed";
    }
    if (saved === "stale" || saved === "failed") {
      await safely(logWithoutCharge);
      return;
    }
    await safely(async () => input.ledger.charge("agent_turn", { cost: saved.due, isByok, log: logFields }));
  } catch (error) {
    console.error("agent-turn: the summary failed:", error);
  }
}

// A bookkeeping call after the model has answered must not turn a finished turn into an exception.
export async function safely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error("agent-turn: bookkeeping failed:", error);
  }
}
