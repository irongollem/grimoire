// The tools one turn offers the narrator, and the router that runs them (#1205, #1021).
//
// Kept out of `handler.ts` so the handler is about the turn's rules (gates, loop, save, charge) and this file is
// about what the narrator may do inside it: the campaign's own tools, a character speaking, moving the party and
// putting a fact on the record. Everything with I/O comes in through `deps`; nothing here touches a database.

import { HAZARD_TOOL, HAZARD_TOOL_NAME, HAZARDS_PER_TURN, keptHazardText, madeHazardText, noSuchHazardText, parseHazard, type HazardRules } from "../_shared/agent/hazard.ts";
import { KEEP_TALKING_TOOL, KEEP_TALKING_TOOL_NAME } from "../_shared/agent/floor.ts";
import { offeredHandout, parseShow, SHOW_TOOL, SHOW_TOOL_NAME, SHOWN_PER_TURN, shownText, type HandoutOffer, type PictureOf, type PlaceCard, type PlaceShare, type Shown } from "../_shared/agent/show.ts";
import {
  BUY_TOOL, COINS_TOOL, COINS_TOOL_NAME, HAND_OVER_TOOL, HAND_OVER_TOOL_NAME, HANDS_PER_TURN, HANDS_TOOL_NAMES, handsText, parseBuy, parseCoins,
  chestPick, parseHandOver, parseTake, purseAfterGaining, TAKE_TOOL, TAKE_TOOL_NAME, worth, type Coins, type HandsChange, type Possessions,
} from "../_shared/agent/hands.ts";
import type { HandsStore } from "./handsIo.ts";
import { HIT_POINTS_TOOL, HIT_POINTS_TOOL_NAME, hitPointsText, parseHitPointChange, parseSetRight, rollTotal, SET_RIGHT_TOOL, SET_RIGHT_TOOL_NAME, setRightText, unaccountedThing, type HitPointChange } from "../_shared/agent/hitPoints.ts";
import { cannotAttempt, changedText, FIGHT_CHANGE_TOOL, parseFightChange, type FightChange, type TurnBudget } from "../_shared/agent/fightChange.ts";
import type { FightState } from "../_shared/agent/fight.ts";
import { alreadyRecorded, existsText, INTRODUCE_TOOL, INTRODUCE_TOOL_NAME, INTRODUCTIONS_PER_TURN, introducedText, parseIntroduction, type Introduction } from "../_shared/agent/introduce.ts";
import { GO_TO_TOOL, makeSceneTool } from "../_shared/agent/scene.ts";
import { parsePassDays, parseTakeDaysBack, PASS_DAYS_TOOL, PASS_DAYS_TOOL_NAME, passedText, TAKE_DAYS_BACK_TOOL, TAKE_DAYS_BACK_TOOL_NAME, takenBackText } from "../_shared/agent/days.ts";
import { planRuling, RULE_INVENTION_TOOL, RULE_INVENTION_TOOL_NAME, type InventionRuling, type PendingInvention } from "../_shared/agent/invention.ts";
import { FIRE_CONSEQUENCE_TOOL, FIRE_CONSEQUENCE_TOOL_NAME, parseFireInput, planFire } from "../_shared/agent/consequence.ts";
import { ROLL_TABLE_TOOL, ROLL_TABLE_TOOL_NAME, rollAnswer } from "../_shared/agent/roadTables.ts";
import { parseTravel, rollableTables, TRAVEL_TOOL, TRAVEL_TOOL_NAME, travelAnswer, type TravelMap } from "../_shared/agent/travel.ts";
import type { Remembered } from "../_shared/agent/characterTurn.ts";
import { makeSpeechTools } from "../_shared/agent/speak.ts";
import { SPEECH_TOOL_NAMES } from "../_shared/agent/speakInput.ts";
import { shownDmRoll } from "../_shared/agent/dmRoll.ts";
import { makeRecordTool, RECORD_TOOL_NAME } from "../_shared/agent/record.ts";
import {
  BRING_OUT_TOOL, BRING_OUT_TOOL_NAME, CANON_LOOKUP_TOOL, CANON_LOOKUP_TOOL_NAME, LOOKUPS_PER_TURN, lookupAnswer, makeBringOutTool, NO_CANON_HERE, parseLookupQuery,
  type BroughtOut, type CanonHere, type CanonLookupEntry,
} from "../_shared/agent/canon.ts";
import { checkInvention, type CanonCheckMaterial } from "../_shared/agent/canonCheck.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import { makeQuestTools, type QuestMove, type QuestsInPlay } from "../_shared/agent/quests.ts";
import { fightsSection, planFight, START_FIGHT_TOOL, statlessText, type FightPlan, type FightsInView } from "../_shared/agent/fight.ts";
import { ASK_ROLL_TOOL, askedText, parseAskRollInput, type PendingRoll } from "../_shared/agent/playerRoll.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import type { AgentLine, AgentTool, CallModel, CallTool } from "../_shared/agent/types.ts";
import type { AgentTurnDeps, SessionRow } from "./turnTypes.ts";

/** A fact filed during this turn. It is on record already, and is taken off again when the turn is not kept. */
export interface FiledFact {
  id: string;
  body: string;
  hidden: boolean;
}

export interface TurnToolsInput {
  deps: Pick<AgentTurnDeps, "tools" | "callTool" | "loadSpeaker" | "findCharacters" | "findHazard" | "isTableMadeCharacter" | "setScene" | "fileFact">;
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
  /** The party member the player plays; nobody speaks for them. */
  playedId?: string;
  /** The rest of the party, by id: a fact is never tied to one of them as if they were a character of the campaign's. */
  partyIds?: readonly string[];
  /** The names of the world's peoples, for the characters' own calls. */
  peoples: readonly string[];
  /**
   * The canon at the table (#1226): what lies where the party stands (the ids `bring_out` accepts), the lookup by
   * meaning, what an invention is held against and the judge that does the holding. Marks wait for the kept turn.
   */
  canon: {
    here: CanonHere;
    /** Null when the canon cannot be searched by meaning right now. */
    lookup(query: string): Promise<CanonLookupEntry[] | null>;
    material(): Promise<CanonCheckMaterial>;
    judge: ((request: JudgeRequest) => Promise<JudgeResult>) | null;
    onBroughtOut(brought: BroughtOut): void;
  };
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
    /** The fights prepared at another place, for when the party moves there in this turn. */
    viewAt(locationId: string): Promise<FightsInView>;
    onStart(plan: FightPlan): void;
    /** The names of the fight's creatures the rules cannot play: those with no stat block. */
    statless(plan: FightPlan): Promise<string[]>;
  } | null;
  /** The played character's hit points and where a change to them goes; null in a fight (the board keeps them) or with nobody played, and then the tool is not offered. */
  hitPoints: { now: { current: number; max: number } | null; onChange(change: HitPointChange): void } | null;
  /** Where a hazard the narrator makes goes; left out, the tool is not offered (a fight on the board is fought with what is on it). */
  onHazard?: (hazard: HazardRules) => void;
  /** The turn is a correction ("That's not what happened"): `set_right` is offered beside the hit points tool. */
  correcting?: boolean;
  /**
   * Things changing hands (`hands.ts`): what the played character carries and the place sells, the lookups a
   * change is checked against, and where a taken change goes. Null with nobody played, in a fight, or when it
   * could not be read; then the tools are not offered.
   */
  hands: {
    memberId: string;
    possessions: Possessions;
    coinValues: ReadonlyMap<string, number>;
    coinsText(coins: Coins): string;
    store: Pick<HandsStore, "belonging" | "characterName" | "carried" | "item">;
    onChange(change: HandsChange): void;
  } | null;
  /** A character has just said or done something, while its exchange may still be going. */
  onSaid?(lines: AgentLine[]): void;
  /** The narrator said the characters go on among themselves (`keep_talking`). */
  onKeepTalking?(): void;
  /** How each exchange between characters left the floor (`floor.ts`); the last one of the turn decides. */
  onExchange?(ended: "to_player" | "open", cutShort: boolean): void;
  /** Takes the roll the narrator asks the player for; null when nobody is played, and then the tool is not offered. */
  askRoll: ((pending: PendingRoll) => void) | null;
  /**
   * What can be put in front of the player: the handouts still to hand over, and the campaign's picture of a
   * record. Null when nobody is played, and then the tool is not offered.
   */
  show: {
    handouts: readonly HandoutOffer[];
    picture(what: PictureOf, id: string): Promise<{ title: string; url: string } | null>;
    /** A place of the campaign, as it may be handed over; null when it is not this campaign's. */
    place(id: string): Promise<PlaceCard | null>;
    /** A place was handed over: shared for real once the turn is kept. */
    onPlace(place: PlaceShare): void;
    /** A handout was handed over: given for real once the turn is kept. */
    onHandout(handout: HandoutOffer): void;
  } | null;
  /**
   * The campaign's places and roads, read when the narrator asks how far somewhere is (`travel.ts`). Null in a
   * fight, where nobody sets out on a journey, and then the tool is not offered.
   */
  travel: { map(): Promise<TravelMap>; /** A whole number from 1 to `max`: the die behind the screen. */ roll(max: number): number } | null;
  /** Whole days passed in the story (`days.ts`): the page moves the campaign's date once the turn is kept. Null in a fight. */
  onDaysPassed: ((days: number) => void) | null;
  /** Days a correction takes back (`take_days_back`); offered in a correction turn only, and null when none is. */
  onDaysTakenBack?: ((days: number) => void) | null;
  /** Offered only with the quests read and no fight on the board: a held payoff is the story's to fire, not a round's. */
  fireHeld?: boolean;
  /**
   * The played character's inventions waiting on a ruling and where a ruling goes (#1103). Null in a fight, with
   * nobody played or nothing waiting, and then the tool is not offered.
   */
  rulings?: { pending: readonly PendingInvention[]; onRule(ruling: InventionRuling): void } | null;
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
  /** The place the Narrator last moved the party to with `go_to` this turn; null when it made no move. */
  movedTo(): string | null;
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
  let movedTo: string | null = null;
  const go = makeSceneTool({
    campaignId,
    sessionId: session.id,
    setScene: deps.setScene,
    onMove: (moved, companions) => {
      place = moved.id;
      movedTo = moved.id;
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
    // Never the played character: their words are the player's alone, whatever id a reply names.
    loadSpeaker: (id) => (input.playedId !== undefined && id === input.playedId ? Promise.resolve(null) : deps.loadSpeaker(campaignId, id)),
    callModel: input.callModel,
    signal: input.signal,
    onRemember: (memory) => remembered.push(memory),
    findRecorded: (name) => deps.findCharacters(campaignId, name),
    onSpoke: (id) => spoke.add(id),
    onExchange: (ended, cutShort) => input.onExchange?.(ended, cutShort),
    onSaid: (lines) => input.onSaid?.(lines),
    playerName: input.playerName,
    peoples: input.peoples,
  });

  const partyIds = new Set([...(input.partyIds ?? []), ...(input.playedId === undefined ? [] : [input.playedId])]);
  // The campaign and the sittings are the conversation's own; the model only chooses the words and what they are about.
  // The canon's clues lie where the party began the turn: once it has moved on they no longer lie where it stands.
  const startedAt = session.scene_location_id;
  const hereNow = (): CanonHere => (place === startedAt ? input.canon.here : NO_CANON_HERE);
  // What an invention is held against is read once a turn, when the first one is recorded.
  let material: Promise<CanonCheckMaterial> | null = null;
  const record = makeRecordTool({
    // The three checks (frame 09): never a contradiction of a truth, an answer to an open question, or a secret
    // stated. Only the narrator's own record calls come here; the server's own facts (a fight's result) do not.
    check: async (fact) => {
      let held: CanonCheckMaterial;
      try {
        material ??= input.canon.material();
        held = await material;
      } catch (error) {
        material = null;
        console.error("agent-turn: the canon check was skipped (the canon could not be read): the fact was filed unchecked.", error);
        return null;
      }
      return checkInvention({
        invention: fact.fact,
        material: held,
        clueSecretIds: new Set(hereNow().clues.map((c) => c.secretId)),
        judge: input.canon.judge,
      });
    },
    fileFact: (fact) =>
      deps.fileFact({
        campaignId,
        campaignSessionId: session.campaign_session_id,
        agentSessionId: session.id,
        provider: input.provider,
        model: input.model,
        ...fact,
        // The record ties a fact to people of the campaign, and a party member is not one of those: an id of the
        // party named there would have the whole fact refused. Seen live (19 Nov 2026): a companion's promise
        // could not be filed, and the narrator told the player about the tool. Their name in the sentence is the tie.
        about: fact.about.filter((a) => !partyIds.has(a.id)),
      }),
    onFiled: (fact) => input.filed.push(fact),
  });

  const quests = input.quests === null ? null : makeQuestTools(input.quests);

  const bringOut = makeBringOutTool({ offered: hereNow, onBroughtOut: input.canon.onBroughtOut });
  // The canon by meaning: a few lookups a turn, each an embedding. Never a secret (`canon.ts`, `canonIo.ts`).
  let lookups = 0;
  const canonLookup = async (toolInput: Record<string, unknown>) => {
    const parsed = parseLookupQuery(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    if (lookups >= LOOKUPS_PER_TURN) return { content: `At most ${LOOKUPS_PER_TURN} lookups in one reply. Work from what you have.`, isError: true };
    lookups += 1;
    try {
      const entries = await input.canon.lookup(parsed.query);
      if (entries === null) return { content: "The canon cannot be searched right now. Work from what is written above and on record.", isError: true };
      return { content: lookupAnswer(entries), isError: false };
    } catch (error) {
      console.error("agent-turn: looking up the canon failed:", error);
      return { content: "The canon could not be searched. Work from what is written above and on record.", isError: true };
    }
  };

  // The fights in view once the party has moved this turn. Seen live: the party walked from the parlour to the
  // library and the narrator started the parlour's fight, the only one it had been shown.
  let fightView: FightsInView | null = null;
  const moved = async (answering: ReturnType<CallTool>, before: string | null): Promise<Awaited<ReturnType<CallTool>>> => {
    const answer = await answering;
    if (answer.isError || input.fight === null || place === null || place === before) return answer;
    try {
      fightView = await input.fight.viewAt(place);
      return { ...answer, content: `${answer.content}\n\n${fightsSection(fightView)}` };
    } catch (error) {
      console.error("agent-turn: reading the fights of the new place failed:", error);
      // Better no listed fight than the last place's: the narrator can still put one together.
      fightView = { ...input.fight.view, prepared: [] };
      return answer;
    }
  };

  // One fight a turn, like one roll: a second would silently replace the first.
  let fightStarted = false;
  const startFight = async (toolInput: Record<string, unknown>) => {
    if (input.fight === null) return { content: "No fight can be started here.", isError: true };
    if (fightStarted) return { content: "A fight was already started this turn. End your reply.", isError: true };
    const planned = planFight(fightView ?? input.fight.view, toolInput);
    if (!planned.ok) return { content: planned.error, isError: true };
    // A fight is played by the rules, and the rules play a creature from its stat block. Someone without one would
    // stand on the map unable to act, with the player asked to move them.
    const statless = await input.fight.statless(planned.plan);
    if (statless.length > 0) return { content: statlessText(statless), isError: true };
    fightStarted = true;
    input.fight.onStart(planned.plan);
    return { content: planned.says, isError: false };
  };

  // The total of the narrator's last roll this turn: the only amount a change to the hit points may take.
  let lastRoll: number | null = null;
  // One change to the hit points a turn: a second would be worked out from the same sheet and replace the first.
  let hitPointsChanged = false;
  // A correction puts the hit points where the corrected story has them (`set_right`): the same one change a turn.
  const setRight = (toolInput: Record<string, unknown>) => {
    if (input.hitPoints === null || input.correcting !== true) return { content: "Hit points are set right only in a correction, outside a fight.", isError: true };
    if (hitPointsChanged) return { content: "The hit points were already changed this turn. Tell what happened and end your reply.", isError: true };
    const parsed = parseSetRight(toolInput, { hitPoints: input.hitPoints.now });
    if (!parsed.ok) return { content: parsed.error, isError: true };
    hitPointsChanged = true;
    input.hitPoints.onChange(parsed.value);
    return { content: setRightText(parsed.value), isError: false };
  };
  const changeHitPoints = async (toolInput: Record<string, unknown>) => {
    if (input.hitPoints === null) return { content: "Hit points are not changed here.", isError: true };
    if (hitPointsChanged) return { content: "The hit points were already changed this turn. Tell what happened and end your reply.", isError: true };
    const parsed = parseHitPointChange(toolInput, { hitPoints: input.hitPoints.now, lastRoll });
    if (!parsed.ok) return { content: parsed.error, isError: true };
    // A thing that is used up must be there to use: a potion nobody carries heals nobody. Checked against what
    // is really carried, so "you have none on you" is something the table knows and not something it guesses.
    const used = parsed.value.used;
    if (used === null && input.hands !== null) {
      const named = unaccountedThing(parsed.value.why, input.hands.possessions.carried);
      if (named !== null) {
        return {
          content: `The player's character carries "${named}". If that is what was used, call this again with used_by "player" and used_thing "${named}", so it leaves their pack; if it was someone else's, give that character's id as used_by. Nothing has changed yet.`,
          isError: true,
        };
      }
    }
    if (used !== null && input.hands !== null) {
      const held = used.characterId === null
        ? await input.hands.store.carried(campaignId, input.hands.memberId, used.thing)
        : await input.hands.store.belonging(campaignId, used.characterId, used.thing);
      if (held === null) {
        return {
          content: used.characterId === null
            ? `The player's character carries no "${used.thing}" (see "What the player's character carries"). Nothing is used and nothing changes: tell them it is not among their things.`
            : `That character carries no "${used.thing}". Nothing is used and nothing changes: tell that.`,
          isError: true,
        };
      }
    }
    hitPointsChanged = true;
    input.hitPoints.onChange(parsed.value);
    return { content: hitPointsText(parsed.value, input.hitPoints.now === null ? 0 : input.hitPoints.now.current), isError: false };
  };

  // Things changing hands. Each is checked against what is really carried, stocked or in the purse before it is
  // taken, and made when the turn is kept. The purse is counted down as the turn's payments are taken, so two
  // payments cannot both be covered by the same coins.
  let handsTaken = 0;
  const lootTaken = new Set<string>();
  let purseLeft: Coins | null = input.hands === null ? null : input.hands.possessions.purse;
  const changeHands = async (name: string, toolInput: Record<string, unknown>): Promise<{ content: string; isError: boolean }> => {
    const hands = input.hands;
    if (hands === null || purseLeft === null) return { content: "Nothing changes hands here.", isError: true };
    if (handsTaken >= HANDS_PER_TURN) return { content: `At most ${HANDS_PER_TURN} things change hands in one turn. Tell what happened and end your reply.`, isError: true };
    const refused = (error: string) => ({ content: error, isError: true });
    let change: HandsChange;
    if (name === HAND_OVER_TOOL_NAME) {
      const parsed = parseHandOver(toolInput);
      if (!parsed.ok) return refused(parsed.error);
      const { direction, characterId, thing, quantity } = parsed.value;
      if (direction === "to_player") {
        const held = await hands.store.belonging(campaignId, characterId, thing);
        // Not listed: what a character carries is theirs to know, not the narrator's.
        if (held === null) return refused("That character does not have that thing among their belongings, so it cannot be given. Let the character say what they have.");
        if (held.quantity < quantity) return refused(`They have only ${held.quantity} of that.`);
        change = { kind: "to_player", from: { id: characterId, name: held.owner }, thing: held.name, quantity };
      } else {
        const [held, receiver] = await Promise.all([hands.store.carried(campaignId, hands.memberId, thing), hands.store.characterName(campaignId, characterId)]);
        if (receiver === null) return refused("No character with that id is in this campaign.");
        if (held === null) return refused("The player's character does not carry that (see \"What the player's character carries\"). Tell them so; nothing is given.");
        if (held.quantity < quantity) return refused(`The player's character has only ${held.quantity} of that.`);
        change = { kind: "from_player", to: { id: characterId, name: receiver }, thing: held.name, quantity };
      }
    } else if (name === TAKE_TOOL_NAME) {
      const parsed = parseTake(toolInput);
      if (!parsed.ok) return refused(parsed.error);
      if (parsed.value.placementId !== null) {
        const placed = hands.possessions.loot.find((l) => l.id === parsed.value.placementId);
        if (placed === undefined) return refused("Nothing with that placement_id is within reach. Use an id listed under \"Placed within reach\".");
        if (lootTaken.has(placed.id)) return refused("That was already taken this turn.");
        if (placed.chest !== undefined) {
          const picked = chestPick(placed.chest, parsed.value.chestThings);
          if (!picked.ok) return refused(picked.error);
          lootTaken.add(placed.id);
          change = { kind: "chest", placementId: placed.id, chest: placed.name, things: picked.value };
        } else {
          if (parsed.value.chestThings !== null) return refused("That is not a chest: give its placement_id alone.");
          lootTaken.add(placed.id);
          change = { kind: "loot", placementId: placed.id, thing: placed.name, quantity: placed.quantity, ref: placed.ref, coins: placed.coins };
        }
      } else if (parsed.value.itemId !== null) {
        const item = await hands.store.item(campaignId, parsed.value.itemId);
        if (item === null) return refused("No item with that id is in this campaign. Look it up with search, or give name alone for a plain object.");
        change = { kind: "take", thing: item.name, quantity: parsed.value.quantity, ref: { itemId: parsed.value.itemId, libraryItemId: null }, ...(parsed.value.fromBody === null ? {} : { from: parsed.value.fromBody }) };
      } else {
        // parseTake gives a name whenever it gives no id.
        change = { kind: "take", thing: parsed.value.name as string, quantity: parsed.value.quantity, ref: { itemId: null, libraryItemId: null }, ...(parsed.value.fromBody === null ? {} : { from: parsed.value.fromBody }) };
      }
    } else if (name === COINS_TOOL_NAME) {
      const parsed = parseCoins(toolInput, { coinValues: hands.coinValues, purse: purseLeft, lastRoll });
      if (!parsed.ok) return refused(parsed.error);
      change = parsed.value;
    } else {
      const parsed = parseBuy(toolInput, { wares: hands.possessions.wares, coinValues: hands.coinValues, purse: purseLeft });
      if (!parsed.ok) return refused(parsed.error);
      change = parsed.value;
    }
    if (change.kind === "pay" || change.kind === "buy") {
      // What this takes is no longer there for the turn's next payment. The exact coins are worked out when it is made.
      const cost = change.kind === "buy" ? change.price : change.coins;
      const left = worth(purseLeft, hands.coinValues) - worth(cost, hands.coinValues);
      const smallest = [...hands.coinValues.entries()].find(([, value]) => value === 1);
      purseLeft = smallest ? { [smallest[0]]: left } : purseLeft;
    } else if (change.kind === "gain") {
      purseLeft = purseAfterGaining(purseLeft, change.coins);
    } else if (change.kind === "loot" && change.coins !== null) {
      purseLeft = purseAfterGaining(purseLeft, change.coins);
    } else if (change.kind === "chest") {
      for (const thing of change.things) if (thing.coins !== null) purseLeft = purseAfterGaining(purseLeft, thing.coins);
    }
    handsTaken += 1;
    hands.onChange(change);
    return { content: handsText(change, hands.coinsText), isError: false };
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
    return { content: parsed.says ?? changedText(parsed.value), isError: false };
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

  // A natural hazard (`hazard.ts`): what the campaign or the library keeps is handed back; one is made only when
  // nothing of that name exists, and written when the turn is kept.
  let hazardsMade = 0;
  const hazard = async (toolInput: Record<string, unknown>) => {
    if (input.onHazard === undefined) return { content: "No hazard can be brought in this turn.", isError: true };
    const parsed = parseHazard(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    const name = parsed.value.kind === "look" ? parsed.value.name : parsed.value.hazard.name;
    const kept = await deps.findHazard(campaignId, name);
    if (kept !== null) return { content: keptHazardText(kept), isError: false };
    if (parsed.value.kind === "look") return { content: noSuchHazardText(name), isError: false };
    if (hazardsMade >= HAZARDS_PER_TURN) return { content: "One hazard is made in a turn. Use the one you made.", isError: true };
    hazardsMade += 1;
    input.onHazard(parsed.value.hazard);
    return { content: madeHazardText(parsed.value.hazard), isError: false };
  };

  // Set once the narrator says the characters go on among themselves: nobody speaks again in this reply.
  let floorKept = false;
  // A handout or a picture put in front of the player (`show.ts`). A handout is handed over once.
  let shownCount = 0;
  const handedOut = new Set<string>();
  const placesShown = new Set<string>();
  const show = async (toolInput: Record<string, unknown>): Promise<{ content: string; isError: boolean; shown?: Shown }> => {
    const refused = (content: string) => ({ content, isError: true });
    if (input.show === null) return refused("Nothing can be shown this turn.");
    const parsed = parseShow(toolInput);
    if (!parsed.ok) return refused(parsed.error);
    if (shownCount >= SHOWN_PER_TURN) return refused(`At most ${SHOWN_PER_TURN} things are shown in one reply.`);
    let shown: Shown;
    if (parsed.value.what === "handout") {
      const handout = offeredHandout(input.show.handouts, parsed.value.id);
      if (handout === null) return refused("No handout with that id is waiting to be handed over. Use an id listed under \"Handouts the campaign prepared\".");
      if (handedOut.has(handout.id)) return refused("That handout was already handed over this turn.");
      handedOut.add(handout.id);
      input.show.onHandout(handout);
      shown = { kind: "handout", id: handout.id, title: handout.title };
    } else if (parsed.value.what === "place") {
      const { id } = parsed.value;
      const card = await input.show.place(id);
      if (card === null) return refused("This campaign has no such place. Use a place id as search or get returned it.");
      if (placesShown.has(id)) return refused("That place was already handed over this turn.");
      placesShown.add(id);
      // The map goes with the place only when the story hands it over, and only when there is one to hand over.
      const withMap = parsed.value.withMap === true && card.hasMapPicture;
      input.show.onPlace({ id, withMap });
      shown = { kind: "place", id, title: card.title, url: card.url, hasMap: card.hasMapPicture && (card.mapShared || withMap), hasNook: card.hasNook };
    } else {
      const picture = await input.show.picture(parsed.value.what, parsed.value.id);
      if (picture === null) return refused("The campaign has no picture of that. Describe it in words instead.");
      shown = { kind: "picture", of: parsed.value.what, title: picture.title, url: picture.url };
    }
    shownCount += 1;
    return { content: shownText(shown), isError: false, shown };
  };

  // How far it is from where the party stands now (after any move this turn) to somewhere else. The map is read
  // once a turn at most: asking about two destinations is one read.
  let travelMap: Promise<TravelMap> | null = null;
  const travel = async (toolInput: Record<string, unknown>) => {
    if (!input.travel) return { content: "Nobody sets out on a journey now.", isError: true };
    const parsed = parseTravel(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    travelMap ??= input.travel.map();
    return travelAnswer(place, parsed.value.toPlaceId, parsed.value.paceId, await travelMap, parsed.value.wayKey);
  };

  // A roll on one of the campaign's placed tables, behind the screen: nothing of it goes to the page.
  const rollTable = async (toolInput: Record<string, unknown>) => {
    if (!input.travel) return { content: "No table is rolled on now.", isError: true };
    const id = toolInput.table_id;
    if (typeof id !== "string") return { content: "table_id must be the id of a table, as travel listed it.", isError: true };
    travelMap ??= input.travel.map();
    const table = rollableTables(await travelMap).find((t) => t.id === id);
    return rollAnswer(table, input.travel.roll);
  };

  // A payoff the DM held back, fired when the story reaches its moment. Checked against what the turn started with
  // and queued with the quest moves, so it is performed once, and only if the turn is kept.
  const fireConsequence = (toolInput: Record<string, unknown>) => {
    if (input.quests === null || input.fireHeld !== true) return { content: "Nothing is fired now, not in the middle of a fight.", isError: true };
    const parsed = parseFireInput(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    const planned = planFire(input.quests.state, input.quests.queued, parsed.value.eventId);
    if (!planned.ok) return { content: planned.error, isError: true };
    input.quests.queued.push(planned.move);
    return { content: planned.says, isError: false };
  };

  // The Dungeon Master's ruling on an invention, queued and made only if the turn is kept. Checked against the
  // inventions the turn was shown, and once for each: a second ruling would fight the first.
  const ruled: InventionRuling[] = [];
  const ruleInvention = (toolInput: Record<string, unknown>) => {
    if (!input.rulings) return { content: "No invention is ruled on now, not in the middle of a fight.", isError: true };
    const planned = planRuling(input.rulings.pending, ruled, toolInput);
    if (!planned.ok) return { content: planned.error, isError: true };
    ruled.push(planned.ruling);
    input.rulings.onRule(planned.ruling);
    return { content: planned.says, isError: false };
  };

  // Once a turn, with the total: two calls would move the date twice for what the story told once.
  let daysPassed = false;
  const passDays = (toolInput: Record<string, unknown>) => {
    if (!input.onDaysPassed) return { content: "No days pass now.", isError: true };
    const parsed = parsePassDays(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    if (daysPassed) return { content: "Days already passed in this reply. Give the total in one call.", isError: true };
    if (daysTakenBack) return { content: "Days were already taken back in this reply, so none can pass in it.", isError: true };
    daysPassed = true;
    input.onDaysPassed(parsed.days);
    return { content: passedText(parsed.days), isError: false };
  };

  // Once a reply, with the total, and never beside pass_days: the date cannot go both ways for what the story told once.
  let daysTakenBack = false;
  const takeDaysBack = (toolInput: Record<string, unknown>) => {
    if (!input.onDaysTakenBack || input.correcting !== true) return { content: "Days are taken back only in a correction.", isError: true };
    const parsed = parseTakeDaysBack(toolInput);
    if (!parsed.ok) return { content: parsed.error, isError: true };
    if (daysTakenBack) return { content: "Days already taken back in this reply. Give the total in one call.", isError: true };
    if (daysPassed) return { content: "Days already passed in this reply, so none can be taken back in it.", isError: true };
    daysTakenBack = true;
    input.onDaysTakenBack(parsed.days);
    return { content: takenBackText(parsed.days), isError: false };
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
    tools: [...deps.tools, ...speech.tools, go.tool, record.tool, BRING_OUT_TOOL, CANON_LOOKUP_TOOL, ...(quests ? quests.tools : []), ...(input.askRoll ? [ASK_ROLL_TOOL] : []), ...(input.fight ? [START_FIGHT_TOOL] : []), ...(input.fightChange ? [FIGHT_CHANGE_TOOL] : []), ...(input.onHazard === undefined ? [] : [HAZARD_TOOL]), ...(input.hitPoints ? [HIT_POINTS_TOOL] : []), ...(input.hitPoints && input.correcting === true ? [SET_RIGHT_TOOL] : []), ...(input.hands ? [HAND_OVER_TOOL, TAKE_TOOL, COINS_TOOL, BUY_TOOL] : []), ...(input.show ? [SHOW_TOOL] : []), ...(input.travel ? [TRAVEL_TOOL, ROLL_TABLE_TOOL] : []), ...(input.onDaysPassed ? [PASS_DAYS_TOOL] : []), ...(input.onDaysTakenBack && input.correcting === true ? [TAKE_DAYS_BACK_TOOL] : []), ...(input.quests !== null && input.fireHeld === true ? [FIRE_CONSEQUENCE_TOOL] : []), ...(input.rulings ? [RULE_INVENTION_TOOL] : []), KEEP_TALKING_TOOL, INTRODUCE_TOOL],
    remembered,
    spoke,
    place: () => place,
    movedTo: () => movedTo,
    callTool: (name, toolInput) => {
      if (name === GO_TO_TOOL.name) return moved(go.call(toolInput), place);
      if (name === RECORD_TOOL_NAME) return record.call(toolInput);
      if (name === BRING_OUT_TOOL_NAME) return bringOut.call(toolInput);
      if (name === CANON_LOOKUP_TOOL_NAME) return canonLookup(toolInput);
      if (input.askRoll && name === ASK_ROLL_TOOL.name) return Promise.resolve(askRoll(toolInput));
      if (input.fight && name === START_FIGHT_TOOL.name) return startFight(toolInput);
      if (name === INTRODUCE_TOOL_NAME) return introduce(toolInput);
      if (name === HAZARD_TOOL_NAME) return hazard(toolInput);
      if (input.show && name === SHOW_TOOL_NAME) return show(toolInput);
      if (input.travel && name === TRAVEL_TOOL_NAME) return travel(toolInput);
      if (input.travel && name === ROLL_TABLE_TOOL_NAME) return rollTable(toolInput);
      if (name === FIRE_CONSEQUENCE_TOOL_NAME) return Promise.resolve(fireConsequence(toolInput));
      if (name === RULE_INVENTION_TOOL_NAME) return Promise.resolve(ruleInvention(toolInput));
      if (input.onDaysPassed && name === PASS_DAYS_TOOL_NAME) return Promise.resolve(passDays(toolInput));
      if (name === TAKE_DAYS_BACK_TOOL_NAME) return Promise.resolve(takeDaysBack(toolInput));
      if (name === KEEP_TALKING_TOOL_NAME) {
        floorKept = true;
        input.onKeepTalking?.();
        return Promise.resolve({ content: "They go on when this reply ends, unless the player steps in. End your reply now: call no more tools.", isError: false });
      }
      // One reply is one beat of the conversation. Seen live: after keep_talking the narrator went on asking
      // characters to speak, round after round in the same reply, until the turn ran out of its token budget.
      if (floorKept && SPEECH_TOOL_NAMES.has(name)) {
        return Promise.resolve({ content: "You already said they go on: the next of them speaks in the next reply, not this one. End your reply now.", isError: true });
      }
      if (input.fightChange && name === FIGHT_CHANGE_TOOL.name) return Promise.resolve(changeFight(toolInput));
      if (input.hitPoints && name === HIT_POINTS_TOOL_NAME) return changeHitPoints(toolInput);
      if (name === SET_RIGHT_TOOL_NAME) return Promise.resolve(setRight(toolInput));
      if (input.hands && HANDS_TOOL_NAMES.has(name)) return changeHands(name, toolInput);
      if (quests && quests.names.has(name)) return quests.call(name, toolInput);
      if (SPEECH_TOOL_NAMES.has(name)) return speech.call(name, toolInput);
      if (name === ROLL_TOOL_NAME) {
        return rolled(deps.callTool(name, toolInput), toolInput.expression).then((answer) => {
          if (!answer.isError) {
            narratorRolled = true;
            lastRoll = rollTotal(answer.content);
          }
          return answer;
        });
      }
      return deps.callTool(name, toolInput);
    },
  };
}
