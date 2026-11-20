// Keeping the turn (#1205): what a turn that ran is worth, whether it may be kept, and everything that is written or
// told only once it is. The order is the contract: screen what the turn wrote, save it, charge for it, then carry
// out what the narrator decided (the fight, what changed hands, the quests), then say `done`, then tidy up.

import { floorOf } from "../_shared/agent/floor.ts";
import { shownText, speakerIdsOf } from "../_shared/agent/conduct.ts";
import { followersOf } from "../_shared/agent/pursuit.ts";
import { creditsForUsd, usdForSteps } from "../_shared/agent/metering.ts";
import { harvestFacts, handsLine, type HandsChange } from "../_shared/agent/hands.ts";
import { rowsFor, type StoredTurn, type TurnRow } from "../_shared/agent/transcript.ts";
import { pressureShown } from "../_shared/agent/quests.ts";
import { fightIsTold, fightRecordText, type FightState } from "../_shared/agent/fight.ts";
import { askOf } from "../_shared/agent/playerRoll.ts";
import type { FightChange } from "../_shared/agent/fightChange.ts";
import type { HitPointChange } from "../_shared/agent/hitPoints.ts";
import type { PlayerCharacter } from "../_shared/agent/playerCharacter.ts";
import { totalTokens, type runTurn } from "../_shared/agent/turn.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import type { makeTurnTools } from "./turnTools.ts";
import { applyKeptQuestMoves, foldIntoSummary, round6, safely } from "./turnSupport.ts";
import { discardFiled, type TurnEffects, type TurnScope } from "./turnScope.ts";
import type { TurnContext } from "./turnContext.ts";
import { MESSAGES, type SessionRow } from "./turnTypes.ts";

/** The finished loop and the tools it ran with, for the steps that decide what of it is kept. */
export interface RanTurn {
  result: Awaited<ReturnType<typeof runTurn>>;
  turnTools: ReturnType<typeof makeTurnTools>;
}

export async function keepTurn(scope: TurnScope, fx: TurnEffects, session: SessionRow, ctx: TurnContext, ran: RanTurn): Promise<void> {
  const { userId, deps, body, provider, price, calibration, emit } = scope;
  const { result } = ran;
  const { lastSeqLoaded } = ctx;

  const { steps } = result;
  // Every model call that was billed: the narrator's, and the ones a character's speech made.
  const billed = [...steps, ...result.toolSteps.map((t) => t.usage)];
  const tokens = totalTokens(billed);
  // Nothing was used (stopped before the first model call): there is nothing to save or to charge.
  if (steps.length === 0) {
    emit({ type: "done", end: result.end, credits: 0, tokens: 0 });
    return;
  }

  let accrued = 0;
  if (!provider.isByok && price && calibration) {
    accrued = round6(creditsForUsd(usdForSteps(billed, price), calibration));
  }

  // ledger input_tokens is ALL input (full rate, cache read and cache write): CreditLogFields has no cached
  // field. The exact split is on the agent_turns rows.
  const last = steps[steps.length - 1];
  const logFields: CreditLogFields = {
    model: last.model,
    provider: last.provider,
    input_tokens: billed.reduce((n, s) => n + s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens, 0),
    output_tokens: billed.reduce((n, s) => n + s.outputTokens, 0),
  };
  // Tokens were spent whether or not they are billed, so they are always logged. A cost of 0 writes no row
  // through recordGeneration, which is why a free turn goes through recordFreeGeneration.
  const logWithoutCharge = () =>
    provider.isByok ? deps.recordGeneration(true, 0, logFields) : deps.recordFreeGeneration(logFields);

  const rows = rowsFor({
    sessionId: session.id,
    userId,
    lastSeq: lastSeqLoaded,
    added: result.added,
    steps,
    toolSteps: result.toolSteps,
  });

  // What the turn wrote is screened before it is kept. A turn the screen refuses is treated like one that
  // could not be saved: nothing of it is stored, put on record or billed, and the page takes back what it
  // had begun to show. An outage of the screen does not stop play (the same stance as for what is sent in).
  let withheld = false;
  try {
    const written = shownText(result.added);
    if (written !== "") {
      // A turn a child said or did something in is held to the tighter bar (`CHILD_TURN_THRESHOLDS`).
      const speakers = speakerIdsOf(result.added);
      const child = speakers.length === 0 ? false : await deps.anyChild(body.campaignId, speakers);
      withheld = await deps.isFlaggedOutput(written, child);
    }
  } catch (error) {
    console.error("agent-turn: screening the turn's own words failed:", error);
  }
  if (withheld) {
    await discardFiled(scope, fx);
    await safely(logWithoutCharge);
    emit({ type: "error", message: MESSAGES.withheld, withheld: true });
    return;
  }

  // Save first, then charge: a turn that was not kept is not billed.
  let saved: { due: number } | "conflict" | "failed";
  try {
    saved = await deps.appendTurns(session.id, lastSeqLoaded, rows, accrued);
  } catch (error) {
    console.error("agent-turn: saving the turn failed:", error);
    saved = "failed";
  }
  if (saved === "conflict" || saved === "failed") {
    await discardFiled(scope, fx);
    await safely(logWithoutCharge);
    emit({ type: "error", message: saved === "conflict" ? MESSAGES.conflict : MESSAGES.notSaved });
    return;
  }

  fx.kept = true;
  const { due } = saved;
  if (due > 0 || provider.isByok) {
    await safely(() => deps.recordGeneration(provider.isByok, due, logFields));
  } else {
    await safely(() => deps.recordFreeGeneration(logFields));
  }
  await carryOutKeptTurn(scope, fx, session, ctx, ran, { due, tokens, rows });
}

/** The writes and the page's news that wait for a kept turn. Each failure costs its own part, never the turn. */
async function carryOutKeptTurn(
  scope: TurnScope,
  fx: TurnEffects,
  session: SessionRow,
  ctx: TurnContext,
  ran: RanTurn,
  kept: { due: number; tokens: number; rows: TurnRow[] },
): Promise<void> {
  const { userId, deps, campaign, provider, price, calibration, callModel, pendingRoll, emit } = scope;
  const { result, turnTools } = ran;
  const { character, questState, fights, hands, stored } = ctx;
  const { due, tokens, rows } = kept;

  // Whoever spoke to the party is where the party is. Written with the kept turn, like their memories.
  const here = turnTools.place();
  if (here !== null && turnTools.spoke.size > 0) {
    await safely(() => deps.placeCharacters(campaign.id, here, [...turnTools.spoke]));
  }
  // What play reveals: the played character has now seen this place and met whoever spoke in front of them.
  // Only for a played character, and only with the kept turn. A failure costs a reveal, never the turn.
  if (session.party_member_id !== null && (here !== null || turnTools.spoke.size > 0)) {
    const memberId = session.party_member_id;
    await safely(() => deps.revealToCharacter({ campaignId: campaign.id, memberId, locationId: here, characterIds: [...turnTools.spoke] }));
  }
  // Kept only now that the turn is: what a character carries away from a moment the player never got to keep
  // would be a memory of something that did not happen. A failure here costs a memory, never the turn.
  if (turnTools.remembered.length > 0) {
    await safely(() =>
      deps.saveMemories({
        campaignId: campaign.id,
        userId,
        provider: provider.provider,
        model: provider.model,
        memories: turnTools.remembered,
        campaignSessionId: session.campaign_session_id,
      })
    );
  }
  // Only now: a turn that was not kept leaves the quests untouched, and the player's retry makes the moves again.
  if (questState !== null) {
    await applyKeptQuestMoves({
      deps,
      ctx: { campaignId: campaign.id, agentSessionId: session.id },
      state: questState,
      queued: fx.queued,
    });
    // Told only when there is or was a clock: a table that never comes under pressure hears nothing of it.
    const shown = pressureShown(questState, fx.queued);
    if (shown !== null || questState.pressure !== null) emit({ type: "pressure", pressure: shown });
  }
  await settleFight(scope, fx, session, ctx, here);
  // (The fight's own line on the record is filed in `settleFight`, where the conversation lets go of it.)
  // What changed hands, in the order it was told. One that cannot be made (the giver's pockets changed, the
  // purse was emptied meanwhile) costs that change and its line, never the turn.
  if (character && hands !== null) {
    const made: HandsChange[] = [];
    for (const change of fx.handed) {
      try {
        await deps.hands.apply({ campaignId: campaign.id, userId, memberId: character.id, memberName: character.name }, change);
        emit({ type: "hands", text: handsLine(change, character.name, hands.coinsText) });
        made.push(change);
      } catch (error) {
        console.error("agent-turn: a change of hands failed:", error);
      }
    }
    // A body that parts were cut from is used up, and the record says so: that is what keeps the same wolf
    // from being skinned twice. One that cannot be filed costs the sentence, never the parts.
    for (const fact of harvestFacts(made, character.name)) {
      try {
        const out = await deps.fileFact({
          campaignId: campaign.id, campaignSessionId: session.campaign_session_id, agentSessionId: session.id,
          provider: provider.provider, model: provider.model, fact, about: [], hidden: false, closes: null,
        });
        if ("id" in out) fx.filed.push({ id: out.id, body: fact, hidden: false });
      } catch (error) {
        console.error("agent-turn: putting the harvest on record failed:", error);
      }
    }
  }
  // Handouts handed over in the story are given for real, now that the turn is kept. One that cannot be given
  // costs that handout (it stays waiting), never the turn.
  if (character) {
    for (const handout of fx.handedOut) {
      try {
        await deps.giveHandout(campaign.id, handout.id, character.id);
      } catch (error) {
        console.error("agent-turn: handing over a handout failed:", error);
      }
    }
  }
  await mendCharacter(scope, fx.hitPointChange, character);
  // The days the story told have passed: the page moves the campaign's date (its calendar lives with the app).
  // A clue that came out in play is found and a passage told, now that the turn is kept: a turn that was not kept
  // leaves the canon as it was. One that cannot be written costs that mark, never the turn.
  for (const brought of fx.broughtOut) {
    await safely(() => deps.canon.bringOut({ campaignId: campaign.id, campaignSessionId: session.campaign_session_id }, brought));
  }
  if (fx.daysPassed > 0) emit({ type: "days", days: fx.daysPassed });
  // The people the narrator made up get their records. One that cannot be written (a plan's limit on
  // characters, a name taken meanwhile) costs that record, never the turn: the facts about them are kept.
  for (const intro of fx.introduced) {
    try {
      const made = await deps.introduceCharacter(
        { campaignId: campaign.id, userId, memberId: session.party_member_id, locationId: here, provider: provider.provider, model: provider.model },
        intro,
      );
      // Announced once, when the person is new to the page; a record brought up to date says nothing.
      if (intro.known && intro.replaces === null) emit({ type: "introduced", person: made });
    } catch (error) {
      console.error("agent-turn: giving an invented person a record failed:", error);
    }
  }
  // A hazard the narrator made becomes the campaign's. One that cannot be written costs the record, never the
  // turn: the story already told it.
  for (const hazard of fx.madeHazards) {
    try {
      await deps.makeHazard({ campaignId: campaign.id, userId, provider: provider.provider, model: provider.model }, hazard);
    } catch (error) {
      console.error("agent-turn: keeping a hazard the narrator made failed:", error);
    }
  }
  // A request to roll lasts one turn: this turn answered or dropped the last one, and may have made a new one.
  // The page is told only when the request is stored, or the roll it sends back would be refused.
  const nowAsked = fx.asked;
  if (nowAsked !== null || pendingRoll !== null) {
    try {
      await deps.setPendingRoll(session.id, campaign.id, nowAsked);
      if (nowAsked !== null) emit({ type: "ask_roll", roll: askOf(nowAsked) });
    } catch (error) {
      console.error("agent-turn: storing the roll that was asked for failed:", error);
    }
  }
  // A fact the player has not learned yet never leaves the server: the page shows only what is known.
  for (const fact of fx.filed) if (!fact.hidden) emit({ type: "fact", fact: { id: fact.id, body: fact.body } });
  // `credits` is this turn's own. A summary's credit shows on the ledger, not in the turn that happened to
  // trigger it.
  // Whose floor it is now: the characters keep it when they were stopped mid-conversation and nothing waits
  // on the player, so the page may let them go on while the player watches.
  const floor = floorOf({
    lastExchange: fx.lastExchange,
    narratorKeeps: fx.narratorKeeps,
    rollAsked: fx.asked !== null,
    inFight: fx.fightPlan !== null || (fights !== null && fights.fight !== null && fights.fight.phase !== "over"),
    finished: result.end === "done",
  });
  emit({ type: "done", end: result.end, credits: due, tokens, ...(floor === "characters" ? { floor } : {}) });

  // After `done`, never before: the player must not wait for housekeeping. An abort is the player leaving.
  if (result.end !== "aborted") {
    const storedNow: StoredTurn[] = [
      ...stored,
      ...rows.map((r) => ({ seq: r.seq, role: r.role, blocks: r.blocks })),
    ];
    await foldIntoSummary({ deps, session, storedNow, callModel, isByok: provider.isByok, price, calibration });
  }
}

/** The fight on the board: one the narrator starts, one it rules on, or one that has been told to its end. */
async function settleFight(scope: TurnScope, fx: TurnEffects, session: SessionRow, ctx: TurnContext, here: string | null): Promise<void> {
  const { userId, deps, campaign, provider, emit } = scope;
  const { fights } = ctx;
  // A fight that is over goes on record in one sentence, written from how it stands and not by the model: the
  // record is what "The story so far" shows, and a sitting's fights left no trace there. A failure to file it
  // costs the line, never the turn.
  const recordFight = async (fight: FightState, how: Parameters<typeof fightRecordText>[1]): Promise<void> => {
    try {
      const fact = fightRecordText(fight, how);
      const out = await deps.fileFact({
        campaignId: campaign.id,
        campaignSessionId: session.campaign_session_id,
        agentSessionId: session.id,
        provider: provider.provider,
        model: provider.model,
        fact,
        about: [],
        hidden: false,
        closes: null,
      });
      if ("id" in out) fx.filed.push({ id: out.id, body: fact, hidden: false });
    } catch (error) {
      console.error("agent-turn: putting the fight on record failed:", error);
    }
  };
  // A fight starts with the kept turn, and the page is told only once it exists. The other way round: once the
  // narrator has been told a fight is over, the conversation lets go of it.
  const planned = fx.fightPlan;
  if (planned !== null && session.party_member_id !== null) {
    try {
      const started = await deps.startFight(
        { campaignId: campaign.id, sessionId: session.id, userId, memberId: session.party_member_id, allies: ctx.companions.filter((c) => c.aiSpeaks).map((c) => c.id), locationId: here, playSessionId: session.campaign_session_id },
        planned,
      );
      emit({ type: "fight", fight: started });
    } catch (error) {
      console.error("agent-turn: starting the fight failed:", error);
    }
  } else if (fx.fightChange !== null) {
    const change: FightChange = fx.fightChange;
    // The board carries the change out. When it ends the fight the narrator has told its end in this reply,
    // so the conversation lets go of the fight now and no aftermath is asked for.
    if (change.ends !== null) {
      await safely(() => deps.setFight(session.id, campaign.id, null));
      if (fights !== null && fights.fight !== null) {
        await recordFight(fights.fight, change.ends);
        // Foes who gave in or ran are done with; one the party ran from is still there to be met again.
        if (change.ends !== "you_get_away") await safely(() => deps.finishFight(campaign.id, fights.fight!.encounterId));
        // Got away: whoever gives chase is the same fight, to be started again where it catches the party.
        else if (followersOf(fights.fight).length > 0) await safely(() => deps.setPursuit(session.id, campaign.id, fights.fight!.encounterId));
        // Foes who gave in are alive and still there, with what they carry; ones who fled took it with them.
        if (change.ends === "they_give_in") await safely(() => deps.layFightLoot(campaign.id, fights.fight!.encounterId, session.scene_location_id, "yielded"));
      }
    }
    emit({ type: "fight_change", change });
  } else if (fights !== null && fights.fight !== null && fightIsTold(fights.fight)) {
    await safely(() => deps.setFight(session.id, campaign.id, null));
    await recordFight(fights.fight, "fought");
    // Fought to the end with no foe standing: the dead do not wait at their place for a second fight.
    if (!fights.fight.fighters.some((f) => f.side === "enemy" && f.hp > 0)) await safely(() => deps.finishFight(campaign.id, fights.fight!.encounterId));
    emit({ type: "fight", fight: null });
  }
}

/** The played character's hit points, and the thing that was used up for it. */
async function mendCharacter(scope: TurnScope, mended: HitPointChange | null, character: PlayerCharacter | null): Promise<void> {
  const { deps, campaign, emit } = scope;
  // A thing that cannot be taken (the narrator named one they do not carry) costs nothing but the tidying: the
  // healing was rolled and stands.
  if (mended !== null && character && character.hitPoints) {
    try {
      await deps.setHitPoints(campaign.id, character.id, mended.after);
      emit({ type: "hit_points", change: { change: mended.change, why: mended.why, by: Math.abs(mended.after - character.hitPoints.current), hp: mended.after, maxHp: mended.max } });
      // The thing that was used leaves whoever carried it: a character's belongings, or the player's own pack.
      if (mended.used !== null) {
        if (mended.used.characterId === null) await deps.hands.useUpCarried(campaign.id, character.id, mended.used.thing);
        else await deps.useUpBelonging(campaign.id, mended.used.characterId, mended.used.thing);
      }
    } catch (error) {
      console.error("agent-turn: changing the character's hit points failed:", error);
    }
  }
}
