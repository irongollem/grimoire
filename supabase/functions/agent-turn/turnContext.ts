// Reading what the turn knows (#1205): the played character, the stored turns, the scene, the quests, the record, the
// fights, what is carried and offered, and the head of the new message that carries all of it (`stateFor`).

import { handoutsSection, type HandoutOffer } from "../_shared/agent/show.ts";
import { lootIsWon } from "../_shared/agent/encounterLoot.ts";
import { companionsSection, type Companion } from "../_shared/agent/companions.ts";
import { skySection } from "../_shared/agent/sky.ts";
import { possessionsSection, type Coins, type Possessions } from "../_shared/agent/hands.ts";
import { historyFrom, systemWithSummary, type StoredTurn } from "../_shared/agent/transcript.ts";
import { coinsText, coinValuesOf } from "./handsIo.ts";
import { characterOf, fightsOf, inventionsOf, memoriesOf, questsOf, recordOf, safely, sceneOf, siteOf, stateFor, systemFor } from "./turnSupport.ts";
import type { TurnScope } from "./turnScope.ts";
import type { SessionRow } from "./turnTypes.ts";
import { NO_CANON_HERE, type CanonHere } from "../_shared/agent/canon.ts";

export type TurnContext = Awaited<ReturnType<typeof readTurnContext>>;

export async function readTurnContext(scope: TurnScope, session: SessionRow) {
  const { deps, body, campaign, scored, emit } = scope;
  const character = await characterOf(deps, campaign.id, session.party_member_id);
  emit({ type: "session", sessionId: session.id, ...(character ? { character: { id: character.id, name: character.name } } : {}) });
  if (scored !== null) emit({ type: "rolled", roll: scored.rolled });
  const stored: StoredTurn[] = await deps.loadTurns(session.id, session.summary_through_seq);
  const lastSeqLoaded = stored.reduce((max, row) => Math.max(max, row.seq), 0);
  const history = historyFrom(stored, session.summary_through_seq);
  // The instructions hold nothing that changes during play; the scene, the quests and the record go at the head
  // of the new message instead (`stateFor`), because a changed instruction costs the whole prompt cache.
  const scene = await sceneOf(deps, campaign.id, session.scene_location_id);
  // Quests sit between the scene and the record: they change when something is marked, like the scene when the
  // party moves, and the summary, which only grows, stays last.
  const questState = await questsOf(deps, campaign.id, session.pressure_clock_id);
  const record = await recordOf(deps, campaign.id, scene);
  // Where the party stands, and who remembers what: both are state that moves in play, so both go with the scene.
  const site = await siteOf(deps, campaign.id, session.scene_location_id);
  const memories = await memoriesOf(deps, campaign.id, scene);
  // Fights: what is prepared here and the one this conversation is waiting on. Unreadable means no fight
  // tool this turn, since the ids it would be asked to name could not be checked.
  const pursuitId = session.pursuit_encounter_id === undefined ? null : session.pursuit_encounter_id;
  let fights = await fightsOf(deps, campaign.id, session.scene_location_id, session.fight_encounter_id, pursuitId);
  // A fight that has not begun and has someone in it the rules cannot play can never be fought: the story
  // would wait on it for good, with the narrator sending the player to a fight screen where nothing can act.
  // The conversation lets go of it and the story goes on. Starting a fight refuses such a fighter, so this is
  // the fight that changed after it was started: a Dungeon Master took a stat block away before it began.
  // Asked only while a fight is waiting, which is a turn or two.
  if (fights !== null && fights.fight !== null && fights.fight.phase === "waiting") {
    const stuck = fights.fight;
    try {
      const statless = await deps.statlessFighters(campaign.id, { kind: "prepared", encounterId: stuck.encounterId, name: stuck.name });
      if (statless.length > 0) {
        await deps.setFight(session.id, campaign.id, null);
        fights = { ...fights, fight: null };
        emit({ type: "fight", fight: null, calledOff: true });
      }
    } catch (error) {
      console.error("agent-turn: checking the waiting fight failed:", error);
    }
  }
  // What the player's character has invented and is waiting on a ruling for. Not in a fight on the board: nobody
  // rules on a workbench in the middle of a round, and the tool is not offered there.
  const fightRunning = fights !== null && fights.fight !== null && fights.fight.phase === "running";
  const inventions = fightRunning || character === null ? [] : await inventionsOf(deps, campaign.id, character.id);
  // The world's peoples are common knowledge for the narrator and every character. Unreadable costs that
  // knowledge for a turn, never the turn.
  let peoples: string[] = [];
  try {
    peoples = await deps.loadPeoples(campaign.id);
  } catch (error) {
    console.error("agent-turn: reading the world's peoples failed:", error);
  }
  // The canon (#1226). The world block and the last sitting are standing text, so they sit in the instructions and
  // stay the same for the whole sitting; what lies where the party stands is state. An unreadable part costs that
  // part for a turn, never the turn.
  let world = "";
  try {
    world = await deps.canon.worldText(campaign.id);
  } catch (error) {
    console.error("agent-turn: reading the world block failed:", error);
  }
  let previously = "";
  try {
    previously = await deps.canon.previously(campaign.id, session.campaign_session_id);
  } catch (error) {
    console.error("agent-turn: reading the last sitting's chronicle failed:", error);
  }
  let canonHere: CanonHere = NO_CANON_HERE;
  try {
    canonHere = await deps.canon.here(campaign.id, session.scene_location_id, scene === null ? [] : scene.characters.map((c) => ({ id: c.id, name: c.name })));
  } catch (error) {
    console.error("agent-turn: reading what the canon holds here failed:", error);
  }
  const system = systemWithSummary(systemFor({ campaign, character, peoples, world, previously }), session.summary);
  const fightTurn = body.fightTurn === undefined ? null : body.fightTurn;
  // A fight fought out with no foe standing leaves its loot where it was fought, before what is within reach
  // is read: the narrator telling what comes of the fight can then say what lies there.
  if (fights !== null && lootIsWon(fights.fight)) {
    const won = fights.fight!;
    await safely(() => deps.layFightLoot(campaign.id, won.encounterId, session.scene_location_id, "fallen"));
  }
  // What the played character carries and the place sells. A failure to read it costs the tools, never the turn.
  let hands: { possessions: Possessions; coinValues: Map<string, number>; coinsText: (coins: Coins) => string } | null = null;
  if (character) {
    try {
      // The quest beats in play: what the campaign placed on them is within reach, like what it placed on the place.
      const beats = questState === null ? [] : questState.threads.flatMap((t) => (t.beat === null ? [] : [t.beat]));
      const loaded = await deps.hands.load(campaign.id, character.id, session.scene_location_id, beats);
      hands = { possessions: loaded.possessions, coinValues: coinValuesOf(loaded.currency), coinsText: coinsText(loaded.currency) };
    } catch (error) {
      console.error("agent-turn: reading what the character carries failed:", error);
    }
  }
  // The handouts still to be handed over. Unreadable costs the handouts for a turn, never the turn.
  let handouts: HandoutOffer[] = [];
  if (character) {
    try {
      handouts = await deps.loadHandouts(campaign.id, character.id);
    } catch (error) {
      console.error("agent-turn: reading the campaign's handouts failed:", error);
    }
  }
  // The rest of the party, played by the AI (row 26). Unreadable costs their part in the turn, never the turn.
  let companions: Companion[] = [];
  try {
    companions = await deps.loadCompanions(campaign.id, character ? character.id : null);
  } catch (error) {
    console.error("agent-turn: reading the rest of the party failed:", error);
  }
  const state = stateFor({ scene, quests: questState, record, fights, fightTurn, possessions: hands === null ? "" : possessionsSection(hands.possessions, hands.coinsText), handouts: handoutsSection(handouts), companions: companionsSection(companions), sky: body.sky === undefined ? "" : skySection(body.sky), canon: canonHere, today: campaign.today, site, memories, inventions });
  return { character, stored, lastSeqLoaded, history, questState, fights, pursuitId, peoples, system, fightTurn, hands, handouts, companions, state, canonHere, inventions };
}
