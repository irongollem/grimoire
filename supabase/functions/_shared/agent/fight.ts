// The story turns into a fight (#1021, story 13). The fight itself is the campaign's own: an encounter, fought on the
// fight screen with the server's rules (#1201 to #1203). This file is only the bridge between the two:
//
//   - the narrator is shown the fights prepared at the party's place, and may start one of those, or one it puts
//     together from creatures it has looked up (`start_fight`);
//   - while a fight is under way the narrator is told so, and told not to narrate blows: what happens in a fight is
//     decided by the fight, never by prose;
//   - when it is over the narrator is told how it stands (who is down, who is left), tells the aftermath, and the
//     conversation lets go of it.
//
// Three rules:
//   1. A fight is started when the turn is kept, like every other write of a turn.
//   2. Ids are checked against what was shown: a prepared fight must be one listed for this place. An improvised
//      fight's creatures are checked against the campaign by the database half.
//   3. One fight at a time: a conversation waiting on a fight cannot start another.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";

/** A fight the DM prepared at the place the party stands in. */
export interface PreparedFight {
  id: string;
  name: string;
  /** Who is in it, in a few words ("3 Marzipan Sentries"); "" when it has nobody yet. */
  creatures: string;
}

/** One creature or character in the fight, as it stands. */
export interface Fighter {
  name: string;
  side: "party" | "enemy" | "other";
  hp: number;
  maxHp: number;
}

/** The fight this conversation started. */
export interface FightState {
  encounterId: string;
  name: string;
  /** `waiting`: started here, not begun on the fight screen. `running`: being fought. `over`: ended. */
  phase: "waiting" | "running" | "over";
  round: number | null;
  fighters: Fighter[];
}

export interface FightsInView {
  prepared: PreparedFight[];
  fight: FightState | null;
}

export const NO_FIGHTS: FightsInView = { prepared: [], fight: null };

export const MAX_PREPARED = 6;
export const MAX_FIGHTERS = 20;
export const MAX_CREATURE_KINDS = 6;
export const MAX_COUNT = 12;
export const NAME_MAX = 80;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADING = "## Fights";

function fighterLine(f: Fighter): string {
  const state = f.hp <= 0 ? "down" : `${f.hp} of ${f.maxHp} hit points`;
  const side = f.side === "party" ? "party" : f.side === "enemy" ? "enemy" : "bystander";
  return `  - ${f.name} (${side}): ${state}`;
}

/** The part of the table's state about fights. Empty when there is nothing to say, so a quiet scene pays nothing. */
export function fightsSection(view: FightsInView, budget: string | null = null): string {
  const { fight } = view;
  const lines: string[] = [];
  if (fight !== null) {
    const shown = fight.fighters.slice(0, MAX_FIGHTERS);
    if (fight.phase === "over") {
      lines.push(
        `The fight "${fight.name}" is over. This is how it stands; tell the aftermath from it now, and decide ` +
          "nothing the fight did not: who is down stays down, who is standing is standing.",
        ...shown.map(fighterLine),
      );
    } else {
      if (fight.phase === "waiting") {
        lines.push(
          `The fight "${fight.name}" is about to begin on the board in front of the player: they are rolling initiative. ` +
            "Narrate no attack and no damage. If they write to you now, answer in a sentence.",
          ...shown.map(fighterLine),
        );
      } else {
        lines.push(
          `The fight "${fight.name}" is being fought on the board in front of the player, by the game's rules (round ${fight.round ?? 1}). ` +
            "The board decides every attack, its damage and who is down: never narrate those, and never use speak for a blow. " +
            "The player comes to you for what the rules have no button for: a threat, a plea, a bargain, a trick with what " +
            "is in the room, running away. Rule on it as a Dungeon Master would. A turn is about six seconds: a line said " +
            "aloud is short and is answered as briefly (speak, one line); trying something costs their Action unless it " +
            "is small. An attempt on a creature always needs their roll: ask for it (ask_roll) and end your reply; " +
            "when what they try is a contest (a grapple, a shove), roll the creature's side first with the roll tool " +
            "and use that total as the DC. On the turn their result arrives, if it succeeded and it changes the fight " +
            "(a creature hindered or hurt, the foes giving in or fleeing, the player getting away), call fight_change, " +
            "then tell it in a sentence or two; if it failed, call fight_change with only what it cost and tell how it fails. A deed dressed up as " +
            "speech costs what the deed costs.",
          ...(budget === null ? [] : [budget]),
          ...shown.map(fighterLine),
        );
      }
    }
  } else if (view.prepared.length > 0) {
    lines.push(
      "Fights prepared at this place. When one of them breaks out, start it with start_fight and its id:",
      ...view.prepared.slice(0, MAX_PREPARED).map((p) => `  - "${p.name}", id ${p.id}${p.creatures ? `: ${p.creatures}` : ""}`),
    );
    if (view.prepared.length > MAX_PREPARED) lines.push(`  and ${view.prepared.length - MAX_PREPARED} more.`);
  }
  return lines.length === 0 ? "" : [HEADING, "", ...lines].join("\n");
}

// --- the tool ---------------------------------------------------------------------------------------------------

export const START_FIGHT_TOOL: AgentTool = {
  name: "start_fight",
  description:
    "Starts a fight when blows are about to be exchanged. The fight is played on the fight screen with the game's " +
    "own rules, not in your prose: after calling this, end your reply with one or two sentences on how it breaks " +
    "out, and narrate no attack or damage. Give either encounter_id (a fight listed under \"Fights\" for this " +
    "place) or name with creatures (monsters or characters you looked up, by their ids, with how many of each). " +
    "One fight at a time. The outcome reaches you once it is over.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      encounter_id: { type: "string", description: "The id of a fight prepared at this place." },
      name: { type: "string", maxLength: NAME_MAX, description: "For a fight you put together: what to call it, in a few words." },
      creatures: {
        type: "array",
        maxItems: MAX_CREATURE_KINDS,
        description: "For a fight you put together: who the party fights.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            monster_id: { type: "string", description: "A monster of this campaign, by its id." },
            npc_id: { type: "string", description: "A character of this campaign, by its id." },
            count: { type: "integer", minimum: 1, maximum: MAX_COUNT, description: "How many (default 1)." },
          },
        },
      },
    },
  },
};

export type FightPlan =
  | { kind: "prepared"; encounterId: string; name: string }
  | { kind: "improvised"; name: string; creatures: Array<{ monsterId: string | null; npcId: string | null; count: number }> };

type Planned = { ok: true; plan: FightPlan; says: string } | { ok: false; error: string };

const refuse = (error: string): Planned => ({ ok: false, error });

/** What the narrator asked for, checked against what it was shown. */
export function planFight(view: FightsInView, input: Record<string, unknown>): Planned {
  if (view.fight !== null && view.fight.phase !== "over") {
    return refuse(`The fight "${view.fight.name}" is already under way. One fight at a time.`);
  }
  const { encounter_id: encounterId, name, creatures } = input;
  if (encounterId !== undefined) {
    if (name !== undefined || creatures !== undefined) return refuse("Give encounter_id alone, or name with creatures.");
    const prepared = typeof encounterId === "string" ? view.prepared.slice(0, MAX_PREPARED).find((p) => p.id === encounterId) : undefined;
    if (!prepared) return refuse("That fight is not listed for this place. Use an id from \"Fights\", or put one together with name and creatures.");
    return { ok: true, plan: { kind: "prepared", encounterId: prepared.id, name: prepared.name }, says: started(prepared.name) };
  }
  if (typeof name !== "string" || name.trim() === "") return refuse("A fight you put together needs a name.");
  if (!Array.isArray(creatures) || creatures.length === 0) return refuse("A fight you put together needs at least one creature.");
  if (creatures.length > MAX_CREATURE_KINDS) return refuse(`At most ${MAX_CREATURE_KINDS} kinds of creature.`);
  const parsed: Array<{ monsterId: string | null; npcId: string | null; count: number }> = [];
  for (const raw of creatures) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse("Each creature is an object with monster_id or npc_id.");
    const c = raw as Record<string, unknown>;
    const monsterId = typeof c.monster_id === "string" && UUID_RE.test(c.monster_id) ? c.monster_id : null;
    const npcId = typeof c.npc_id === "string" && UUID_RE.test(c.npc_id) ? c.npc_id : null;
    // Exactly one: a creature is a monster or a character, and the fight's roster holds one id for it.
    if ((monsterId === null) === (npcId === null)) return refuse("Each creature needs exactly one of monster_id or npc_id, as the id you looked up.");
    const count = c.count === undefined ? 1 : c.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      return refuse(`count must be a whole number from 1 to ${MAX_COUNT}.`);
    }
    parsed.push({ monsterId, npcId, count });
  }
  const called = name.trim().slice(0, NAME_MAX);
  return { ok: true, plan: { kind: "improvised", name: called, creatures: parsed }, says: started(called) };
}

/** What the narrator is told when a creature of the fight it asked for has no stat block. */
export function statlessText(names: readonly string[]): string {
  return (
    `${names.join(", ")} ${names.length === 1 ? "has" : "have"} no stat block, so the rules cannot fight ${names.length === 1 ? "them" : "any of them"}. ` +
    "No fight was started. Play this out in the story instead: let the player try what they want (to threaten, to grab, " +
    "to strike once) and ask for a roll when chance decides; or start a fight with a monster you looked up that fits."
  );
}

function started(name: string): string {
  return (
    `When the turn is kept, the fight "${name}" starts and the player is sent to the fight screen. End your reply ` +
    "now with one or two sentences on how it breaks out. Narrate no attack and no damage."
  );
}

// --- reading the fight ------------------------------------------------------------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** One live combatant as the fight holds it (jsonb), or null when it is not one. */
export function asFighter(raw: unknown): Fighter | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || raw.name === "") return null;
  const { hp, max_hp: maxHp, faction_id: faction, type } = raw;
  if (typeof hp !== "number" || typeof maxHp !== "number" || !Number.isFinite(hp) || !Number.isFinite(maxHp)) return null;
  // The party is whoever fights for the players: the characters themselves and the players' faction.
  const side = type === "player" || faction === "players" ? "party" : faction === "enemy" ? "enemy" : "other";
  return { name: raw.name, side, hp: Math.max(0, Math.round(hp)), maxHp: Math.max(0, Math.round(maxHp)) };
}

/**
 * Where the fight stands, from its encounter and its live row. No live row, or one still in round 0 and not shared
 * with players and not ended, is a fight that has not begun. An encounter marked finished is over even without a live row.
 */
export function fightStateOf(input: {
  encounterId: string;
  name: string;
  finished: boolean;
  live: { isRunning: boolean; endedAt: string | null; round: number; combatants: unknown } | null;
}): FightState {
  const { live } = input;
  const fighters = live !== null && Array.isArray(live.combatants) ? live.combatants.map(asFighter).filter((f): f is Fighter => f !== null) : [];
  const over = input.finished || (live !== null && live.endedAt !== null);
  // A fight at the AI table is never shared with players ("live"), so `isRunning` alone would leave it waiting for
  // good: a fight whose first round has begun is being fought, shared or not.
  const phase = over ? "over" : live !== null && (live.isRunning || live.round >= 1) ? "running" : "waiting";
  return { encounterId: input.encounterId, name: input.name, phase, round: live === null ? null : live.round, fighters };
}

/** Whether the conversation lets go of its fight after this kept turn: the narrator has now been told it is over. */
export function fightIsTold(fight: FightState | null): boolean {
  return fight !== null && fight.phase === "over";
}
