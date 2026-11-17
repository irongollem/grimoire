// The tools one turn offers the narrator, and the router that runs them (#1205, #1021).
//
// Kept out of `handler.ts` so the handler is about the turn's rules (gates, loop, save, charge) and this file is
// about what the narrator may do inside it: the campaign's own tools, a character speaking, moving the party and
// putting a fact on the record. Everything with I/O comes in through `deps`; nothing here touches a database.

import { cannotAttempt, changedText, FIGHT_CHANGE_TOOL, parseFightChange, type FightChange, type TurnBudget } from "../_shared/agent/fightChange.ts";
import type { FightState } from "../_shared/agent/fight.ts";
import { alreadyRecorded, existsText, INTRODUCE_TOOL, INTRODUCE_TOOL_NAME, INTRODUCTIONS_PER_TURN, introducedText, parseIntroduction, type Introduction } from "../_shared/agent/introduce.ts";
import { GO_TO_TOOL, makeSceneTool } from "../_shared/agent/scene.ts";
import type { Remembered } from "../_shared/agent/characterTurn.ts";
import { makeSpeechTools } from "../_shared/agent/speak.ts";
import { SPEECH_TOOL_NAMES } from "../_shared/agent/speakInput.ts";
import { shownDmRoll } from "../_shared/agent/dmRoll.ts";
import { makeRecordTool, RECORD_TOOL_NAME } from "../_shared/agent/record.ts";
import { makeQuestTools, type QuestMove, type QuestsInPlay } from "../_shared/agent/quests.ts";
import { planFight, START_FIGHT_TOOL, statlessText, type FightPlan, type FightsInView } from "../_shared/agent/fight.ts";
import { ASK_ROLL_TOOL, askedText, parseAskRollInput, type PendingRoll } from "../_shared/agent/playerRoll.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import type { AgentTool, CallModel, CallTool } from "../_shared/agent/types.ts";
import type { AgentTurnDeps, SessionRow } from "./handler.ts";

/** A fact filed during this turn. It is on record already, and is taken off again when the turn is not kept. */
export interface FiledFact {
  id: string;
  body: string;
  hidden: boolean;
}

export interface TurnToolsInput {
  deps: Pick<AgentTurnDeps, "tools" | "callTool" | "loadSpeaker" | "findCharacters" | "isTableMadeCharacter" | "setScene" | "fileFact">;
  campaignId: string;
  session: SessionRow;
  stored: StoredTurn[];
  provider: string;
  model: string;
  callModel: CallModel;
  signal?: AbortSignal;
  /** The party arrived somewhere: only the place's id and name, for the browser. */
  onMove(place: { id: string; name: string }): void;
  /** The turn's own list of filed facts, owned by the caller so it can still reach them when the turn throws. */
  filed: FiledFact[];
  /**
   * The quests in play and the turn's own queue of moves, applied only once the turn is kept. Null when the quests
   * could not be read: no quest tool is offered then, since its ids could not be checked.
   */
  quests: { state: QuestsInPlay; queued: QuestMove[] } | null;
  /** The name of the character the player plays, when the conversation has one: characters hear the player under it. */
  playerName?: string;
  /** The names of the world's peoples, for the characters' own calls. */
  peoples: readonly string[];
  /** The fight on the board and what the player's turn still holds; null when no fight is being fought, and then the tool is not offered. */
  fightChange: {
    fight: FightState;
    budget: TurnBudget | null;
    /** Whether the roll the player sent with this turn succeeded; null when the turn carried none. */
    rolled: boolean | null;
    onChange(change: FightChange): void;
  } | null;
  /** Takes a person the narrator gives a record; the record is made when the turn is kept. */
  onIntroduce(intro: Introduction): void;
  /** The fights in view and where a started one goes; null when no fight can be started, and then the tool is not offered. */
  fight: {
    view: FightsInView;
    onStart(plan: FightPlan): void;
    /** The names of the fight's creatures the rules cannot play: those with no stat block. */
    statless(plan: FightPlan): Promise<string[]>;
  } | null;
  /** Takes the roll the narrator asks the player for; null when nobody is played, and then the tool is not offered. */
  askRoll: ((pending: PendingRoll) => void) | null;
}

export interface TurnTools {
  tools: AgentTool[];
  callTool: CallTool;
  /** What characters chose to remember this turn; filed only once the turn is saved. */
  remembered: Array<{ characterId: string } & Remembered>;
  /** The recorded characters who spoke or acted this turn: they are where the party is. */
  spoke: Set<string>;
  /** Where the party is now, after any move this turn; null when it has no place. */
  place(): string | null;
}

/** The campaign's own roll tool: the Dungeon Master's dice. */
const ROLL_TOOL_NAME = "roll";

/** A roll's answer with the open roll picked out of it for the page; a hidden or failed roll carries none. */
async function rolled(answering: ReturnType<CallTool>, expression: unknown): Promise<Awaited<ReturnType<CallTool>>> {
  const answer = await answering;
  if (answer.isError) return answer;
  const dmRoll = shownDmRoll(answer.content, expression);
  return dmRoll === null ? answer : { ...answer, dmRoll };
}

export function makeTurnTools(input: TurnToolsInput): TurnTools {
  const { deps, campaignId, session } = input;

  let place = session.scene_location_id;
  const go = makeSceneTool({
    campaignId,
    sessionId: session.id,
    setScene: deps.setScene,
    onMove: (moved, companions) => {
      place = moved.id;
      // Whoever came along is placed with the party when the turn is kept, like anyone who spoke to it.
      for (const id of companions) spoke.add(id);
      input.onMove(moved);
    },
  });

  // A character speaks through its own model call, built from that character alone (`speak.ts`). The same
  // model for now: a cheaper one for speech needs its own price row first.
  const remembered: TurnTools["remembered"] = [];
  const spoke = new Set<string>();
  const speech = makeSpeechTools({
    stored: input.stored,
    loadSpeaker: (id) => deps.loadSpeaker(campaignId, id),
    callModel: input.callModel,
    signal: input.signal,
    onRemember: (memory) => remembered.push(memory),
    findRecorded: (name) => deps.findCharacters(campaignId, name),
    onSpoke: (id) => spoke.add(id),
    playerName: input.playerName,
    peoples: input.peoples,
  });

  // The campaign and the sittings are the conversation's own; the model only chooses the words and what they are about.
  const record = makeRecordTool({
    fileFact: (fact) =>
      deps.fileFact({
        campaignId,
        campaignSessionId: session.campaign_session_id,
        agentSessionId: session.id,
        provider: input.provider,
        model: input.model,
        ...fact,
      }),
    onFiled: (fact) => input.filed.push(fact),
  });

  const quests = input.quests === null ? null : makeQuestTools(input.quests);

  // One fight a turn, like one roll: a second would silently replace the first.
  let fightStarted = false;
  const startFight = async (toolInput: Record<string, unknown>) => {
    if (input.fight === null) return { content: "No fight can be started here.", isError: true };
    if (fightStarted) return { content: "A fight was already started this turn. End your reply.", isError: true };
    const planned = planFight(input.fight.view, toolInput);
    if (!planned.ok) return { content: planned.error, isError: true };
    // A fight is played by the rules, and the rules play a creature from its stat block. Someone without one would
    // stand on the map unable to act, with the player asked to move them.
    const statless = await input.fight.statless(planned.plan);
    if (statless.length > 0) return { content: statlessText(statless), isError: true };
    fightStarted = true;
    input.fight.onStart(planned.plan);
    return { content: planned.says, isError: false };
  };

  // Whether the narrator has made a roll of its own this turn: a creature's saving throw has to have been rolled
  // before a change can rest on it.
  let narratorRolled = false;
  // One change to the fight a turn: a second would silently replace the first.
  let fightChanged = false;
  const changeFight = (toolInput: Record<string, unknown>) => {
    if (input.fightChange === null) return { content: "No fight is being fought, so there is nothing to change.", isError: true };
    if (fightChanged) return { content: "The fight was already changed this turn. Tell what happens and end your reply.", isError: true };
    const parsed = parseFightChange(input.fightChange.fight, input.fightChange.budget, toolInput, { player: input.fightChange.rolled, byNarrator: narratorRolled });
    if (!parsed.ok) return { content: parsed.error, isError: true };
    fightChanged = true;
    input.fightChange.onChange(parsed.value);
    return { content: changedText(parsed.value), isError: false };
  };

  // A person the narrator made up gets a record, once the name is known to be new (`introduce.ts`).
  let introductions = 0;
  const introduce = async (toolInput: Record<string, unknown>) => {
    const parsed = parseIntroduction(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    if (introductions >= INTRODUCTIONS_PER_TURN) return { content: `At most ${INTRODUCTIONS_PER_TURN} people get a record in one turn.`, isError: true };
    const existing = alreadyRecorded(parsed.value.name, await deps.findCharacters(campaignId, parsed.value.name));
    // Someone the table made up itself may be rewritten; a record the DM wrote or edited is theirs.
    if (existing !== null && !(await deps.isTableMadeCharacter(campaignId, existing.id))) return { content: existsText(existing), isError: true };
    const intro = existing === null ? parsed.value : { ...parsed.value, replaces: existing.id };
    introductions += 1;
    input.onIntroduce(intro);
    return { content: introducedText(intro), isError: false };
  };

  // One request a turn: the story stops for a single roll, and a second would silently replace the first.
  let rollAsked = false;
  const askRoll = (toolInput: Record<string, unknown>) => {
    const parsed = parseAskRollInput(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    if (rollAsked) return { content: "A roll was already asked for this turn. End your reply and wait for it.", isError: true };
    // In a fight a roll is for an attempt, and an attempt is paid from the turn: no roll is asked that the turn
    // cannot pay for.
    const unpayable = input.fightChange === null ? null : cannotAttempt(input.fightChange.budget);
    if (unpayable !== null) return { content: unpayable, isError: true };
    rollAsked = true;
    input.askRoll?.(parsed.value);
    return { content: askedText(parsed.value), isError: false };
  };

  return {
    tools: [...deps.tools, ...speech.tools, go.tool, record.tool, ...(quests ? quests.tools : []), ...(input.askRoll ? [ASK_ROLL_TOOL] : []), ...(input.fight ? [START_FIGHT_TOOL] : []), ...(input.fightChange ? [FIGHT_CHANGE_TOOL] : []), INTRODUCE_TOOL],
    remembered,
    spoke,
    place: () => place,
    callTool: (name, toolInput) => {
      if (name === GO_TO_TOOL.name) return go.call(toolInput);
      if (name === RECORD_TOOL_NAME) return record.call(toolInput);
      if (input.askRoll && name === ASK_ROLL_TOOL.name) return Promise.resolve(askRoll(toolInput));
      if (input.fight && name === START_FIGHT_TOOL.name) return startFight(toolInput);
      if (name === INTRODUCE_TOOL_NAME) return introduce(toolInput);
      if (input.fightChange && name === FIGHT_CHANGE_TOOL.name) return Promise.resolve(changeFight(toolInput));
      if (quests && quests.names.has(name)) return quests.call(name, toolInput);
      if (SPEECH_TOOL_NAMES.has(name)) return speech.call(name, toolInput);
      if (name === ROLL_TOOL_NAME) {
        return rolled(deps.callTool(name, toolInput), toolInput.expression).then((answer) => {
          if (!answer.isError) narratorRolled = true;
          return answer;
        });
      }
      return deps.callTool(name, toolInput);
    },
  };
}
