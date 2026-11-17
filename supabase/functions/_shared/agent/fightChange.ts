// What the Dungeon Master may do to a fight at the table (#1021, Solo Table canvas, frame 15).
//
// A fight is played on the board by the game's rules, and the narrator never decides a blow. But "trying to flee or
// talk them down always remains an option ... trying to lure them into traps, throwing a blanket on their face":
// what the rules have no button for is ruled on by the Dungeon Master, and a ruling has to be able to change the
// fight. One tool does that, in three ways: a condition on a creature, damage to a creature, the fight's end.
//
// Rules:
//   1. One turn of about six seconds pays for the board and the story alike. The page says what the player's turn
//      still holds; a change that costs what is already spent is refused here, before anything is told.
//   2. Never a blow the rules cover: no damage from an ordinary attack, and no change to the player's own hit
//      points. A stunt's damage is rolled with the roll tool first and passed as a number.
//   3. One change a turn, made when the turn is kept, and carried out by the board (the page), which holds the
//      fight: the story never writes the fight's row itself.
//   4. Nothing is done to a creature on the narrator's say-so. Seen live: "i try to overpower the last spunhound by
//      pinning it down" was answered with the hound Grappled and no roll at all. A change is taken only in the turn
//      that carries the player's roll for it, and only when that roll succeeded: the narrator asks first (ask_roll),
//      the player rolls, and the next turn may change the fight. The code holds that, not the prompt.
//   5. Some things are resisted, not attempted: the one on the receiving end rolls (a saving throw), as when sand is
//      thrown in a creature's eyes or it is hit by a spell. Then the roll is the creature's, made by the narrator
//      with the roll tool in the same turn and passed here with the number it had to meet. A save that is made
//      changes nothing; the turn still pays.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";
import type { FightState } from "./fight.ts";

/** What the player's turn still holds, as the page tells it. True means still available. */
export interface TurnBudget {
  /** It is the played character's turn. */
  yours: boolean;
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /** One short line aloud. */
  words: boolean;
}

export type Cost = "action" | "bonus" | "reaction" | "nothing";
export type FightEnd = "they_give_in" | "they_flee" | "you_get_away";

// Conditions a stunt or a threat can plausibly put on a creature. The ones that take a creature out of the fight
// outright (Paralyzed, Petrified, Stunned, Unconscious) are left to the rules that grant them.
export const STUNT_CONDITIONS = ["Blinded", "Deafened", "Frightened", "Grappled", "Poisoned", "Prone", "Restrained"] as const;
export type StuntCondition = (typeof STUNT_CONDITIONS)[number];

export const MAX_ROUNDS = 3;
export const MAX_DAMAGE = 60;

export interface FightChange {
  costs: Cost;
  condition: { target: string; name: StuntCondition; rounds: number } | null;
  damage: { target: string; amount: number; type: string | null } | null;
  ends: FightEnd | null;
}

export const FIGHT_CHANGE_TOOL: AgentTool = {
  name: "fight_change",
  description:
    "Changes the fight on the board after you have ruled on something the rules have no button for (a threat, a " +
    "plea, a trick, running away). It works only on the turn that carries the player's successful roll for the " +
    "attempt: ask for that roll first with ask_roll. Say what it costs the player's turn, and give at least one of: a condition on a " +
    "creature, damage to a creature (roll it with the roll tool first and pass the number), or how the fight ends. " +
    "Never use it for an ordinary attack, and never on the player's own character. Name creatures exactly as the " +
    "section \"Fights\" lists them. One change a turn; it is carried out when the turn is kept.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      costs: {
        type: "string",
        enum: ["action", "bonus", "reaction", "nothing"],
        description: "What it costs the player's turn. Trying something is an Action; a small thing may be a Bonus Action; a reply to what just happened is a Reaction; words alone cost nothing.",
      },
      condition: {
        type: "object",
        additionalProperties: false,
        properties: {
          target: { type: "string", description: "The creature's name as listed." },
          name: { type: "string", enum: [...STUNT_CONDITIONS] },
          rounds: { type: "integer", minimum: 1, maximum: MAX_ROUNDS, description: "How many rounds it lasts (default 1)." },
        },
        required: ["target", "name"],
      },
      damage: {
        type: "object",
        additionalProperties: false,
        properties: {
          target: { type: "string", description: "The creature's name as listed." },
          amount: { type: "integer", minimum: 1, maximum: MAX_DAMAGE, description: "The damage, already rolled with the roll tool." },
          type: { type: "string", description: "The damage type, in one word (bludgeoning, fire...)." },
        },
        required: ["target", "amount"],
      },
      their_save: {
        type: "object",
        additionalProperties: false,
        description: "When the creature resists with a saving throw instead of the player rolling: its total (rolled with the roll tool this turn) and the DC it had to meet.",
        properties: {
          total: { type: "integer", description: "The creature's saving throw total." },
          dc: { type: "integer", minimum: 1, maximum: 30, description: "The DC it had to meet or beat." },
        },
        required: ["total", "dc"],
      },
      ends: {
        type: "string",
        enum: ["they_give_in", "they_flee", "you_get_away"],
        description: "The fight is over: the foes give in, the foes flee, or the player's character gets away.",
      },
    },
    required: ["costs"],
  },
};

type Parsed = { ok: true; value: FightChange } | { ok: false; error: string };
const refuse = (error: string): Parsed => ({ ok: false, error });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isWhole = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The fighter the narrator named, when it is one it may change: listed, not the party's, still standing. */
function foe(fight: FightState, raw: unknown): { name: string; immune: string[] } | string {
  if (typeof raw !== "string" || raw.trim() === "") return "Name the creature as the section \"Fights\" lists it.";
  const found = fight.fighters.find((f) => same(f.name, raw));
  if (!found) return `Nobody called "${raw.trim()}" is in this fight. Use a name from the section "Fights".`;
  if (found.side === "party") return "That is the player's own side. This tool never changes the player's character.";
  if (found.hp <= 0) return `${found.name} is already down.`;
  return { name: found.name, immune: found.nature ? found.nature.immune : [] };
}

/** What the narrator asked for, checked against the fight as it stands and what the player's turn still holds. */
export function parseFightChange(
  fight: FightState | null,
  budget: TurnBudget | null,
  input: Record<string, unknown>,
  /**
   * What was rolled for it. `player`: whether the roll the player sent with this turn succeeded, null when the turn
   * carried none. `byNarrator`: whether the narrator made a roll with the roll tool this turn (a creature's save).
   */
  evidence: { player: boolean | null; byNarrator: boolean },
): Parsed {
  if (fight === null || fight.phase !== "running") return refuse("No fight is being fought, so there is nothing to change.");
  let rolled = evidence.player;
  // The creature's own save decides when the narrator names one: SRD 5.1 "Saving Throws", the save succeeds when its
  // total equals or exceeds the DC.
  if (input.their_save !== undefined) {
    const save = input.their_save;
    if (!isRecord(save) || !isWhole(save.total, -10, 60) || !isWhole(save.dc, 1, 30)) return refuse("their_save needs the creature's total and the DC it had to meet, as whole numbers.");
    if (!evidence.byNarrator) return refuse("Roll the creature's saving throw with the roll tool first, in this turn, then pass its total here.");
    rolled = save.total < save.dc;
  }
  if (rolled === null) {
    return refuse(
      "Nothing changes without the player's roll. Ask for it now with ask_roll (a contest is the creature's own roll " +
        "first, with the roll tool, and that total as the DC), end your reply saying what to roll, and change the fight " +
        "on the turn their result arrives. When it is the creature that must resist (a saving throw), roll its save with " +
        "the roll tool now and pass their_save.",
    );
  }

  const { costs, condition, damage, ends } = input;
  if (costs !== "action" && costs !== "bonus" && costs !== "reaction" && costs !== "nothing") {
    return refuse("costs must be action, bonus, reaction or nothing.");
  }
  // A failed attempt does nothing to anyone, and still costs the turn what trying cost.
  if (!rolled) {
    if (costs === "nothing") return refuse("The roll went against the attempt, so nothing changes. Tell what happens instead.");
    if (budget !== null && !budget[costs]) return refuse("The roll went against the attempt and the turn had nothing left to pay with: nothing changes.");
    return { ok: true, value: { costs, condition: null, damage: null, ends: null } };
  }
  if (condition === undefined && damage === undefined && ends === undefined) return refuse("Give a condition, damage or how the fight ends.");
  // What the page does not tell cannot be checked; then the cost is taken on the narrator's word.
  if (budget !== null) {
    if (costs !== "reaction" && !budget.yours) return refuse("It is not the player's turn. Only a Reaction can be spent now.");
    if (costs !== "nothing" && !budget[costs]) {
      const name = costs === "action" ? "Action" : costs === "bonus" ? "Bonus Action" : "Reaction";
      return refuse(`The player has already used their ${name} this turn. Tell them so in one sentence; nothing changes.`);
    }
  }

  let withCondition: FightChange["condition"] = null;
  if (condition !== undefined) {
    if (!isRecord(condition)) return refuse("condition is an object with target and name.");
    const target = foe(fight, condition.target);
    if (typeof target === "string") return refuse(target);
    const name = STUNT_CONDITIONS.find((c) => c === condition.name);
    if (name === undefined) return refuse(`condition.name must be one of: ${STUNT_CONDITIONS.join(", ")}.`);
    const rounds = condition.rounds === undefined ? 1 : condition.rounds;
    if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) return refuse(`rounds is a whole number from 1 to ${MAX_ROUNDS}.`);
    // What its stat block makes it immune to cannot be put on it by a stunt either.
    if (target.immune.includes(name)) return refuse(`${target.name} cannot be ${name}: it is immune. Tell how the attempt fails; it still costs what it cost.`);
    withCondition = { target: target.name, name, rounds };
  }

  let withDamage: FightChange["damage"] = null;
  if (damage !== undefined) {
    if (!isRecord(damage)) return refuse("damage is an object with target and amount.");
    const target = foe(fight, damage.target);
    if (typeof target === "string") return refuse(target);
    const { amount, type } = damage;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > MAX_DAMAGE) {
      return refuse(`amount is the damage already rolled: a whole number from 1 to ${MAX_DAMAGE}.`);
    }
    if (type !== undefined && (typeof type !== "string" || type.trim().length > 20)) return refuse("type is one word.");
    withDamage = { target: target.name, amount, type: typeof type === "string" && type.trim() !== "" ? type.trim().toLowerCase() : null };
  }

  if (ends !== undefined && ends !== "they_give_in" && ends !== "they_flee" && ends !== "you_get_away") {
    return refuse("ends must be they_give_in, they_flee or you_get_away.");
  }
  // A fight cannot be ended by a foe that never yields: a construct is not talked down, the dead do not run.
  if (ends === "they_give_in" || ends === "they_flee") {
    const unyielding = fight.fighters.filter((f) => f.side === "enemy" && f.hp > 0 && f.nature !== undefined && !f.nature.yields).map((f) => f.name);
    if (unyielding.length > 0) {
      return refuse(`${unyielding.join(", ")} never ${ends === "they_give_in" ? "gives in" : "flees"} (see "Fights"). The attempt fails however well it was rolled: tell that, and what the player could try instead.`);
    }
  }
  return { ok: true, value: { costs, condition: withCondition, damage: withDamage, ends: ends === undefined ? null : ends } };
}

export function changedText(change: FightChange): string {
  if (change.condition === null && change.damage === null && change.ends === null) {
    return "The roll went against the attempt: it does nothing, and when this turn is kept it has cost the player what trying costs. Tell how it fails in a sentence.";
  }
  const parts: string[] = [];
  if (change.condition) parts.push(`${change.condition.target} becomes ${change.condition.name} for ${change.condition.rounds} round${change.condition.rounds === 1 ? "" : "s"}`);
  if (change.damage) parts.push(`${change.damage.target} takes ${change.damage.amount}${change.damage.type ? ` ${change.damage.type}` : ""} damage`);
  if (change.ends) parts.push("the fight ends");
  return (
    `When this turn is kept: ${parts.join("; ")}. Tell what happens in a sentence or two, and do not narrate it twice. ` +
    "Say plainly what it did to the creature (hurt, blinded, driven off): the player must be able to tell from your words that it mattered."
  );
}

/**
 * Why an attempt cannot be asked a roll for right now, or null when the turn can pay for one. Asked before the roll,
 * not after: seen live, the player was asked for Persuasion, rolled a 15, and was then told the Action was already
 * spent. A roll the turn cannot pay for is a roll wasted.
 */
export function cannotAttempt(budget: TurnBudget | null): string | null {
  if (budget === null) return null;
  if (!budget.yours) {
    return budget.reaction
      ? null
      : "It is not the player's turn and their Reaction is spent, so they cannot attempt anything now. Tell them in one sentence that it waits for their turn. Ask for no roll.";
  }
  if (budget.action || budget.bonus) return null;
  return "The player has used their Action and Bonus Action this turn, so they cannot attempt anything more in it. Tell them so in one sentence: it waits for their next turn. Ask for no roll.";
}

/** What the turn still holds, as a line of the narrator's state. */
export function budgetLine(budget: TurnBudget): string {
  if (!budget.yours) {
    return `It is not the player's turn. They can only react${budget.reaction ? "" : ", and their Reaction is already spent"}; anything else waits for their turn.`;
  }
  const left = [budget.action ? "Action" : null, budget.bonus ? "Bonus Action" : null, budget.reaction ? "Reaction" : null, budget.words ? "a few words" : null]
    .filter((p): p is string => p !== null);
  return left.length === 0 ? "It is the player's turn, and they have nothing left in it but to move or end it." : `It is the player's turn. It still holds: ${left.join(", ")}.`;
}
