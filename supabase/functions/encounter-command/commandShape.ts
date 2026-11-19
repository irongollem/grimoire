// The shape of what a batch sends, checked before anything is loaded or saved. A value the reducer cannot read (a
// number that is NaN, a condition with no name, a list that is a string) would otherwise be saved into the fight and
// make every later batch on it throw. Rules about what a command MEANS stay in the reducer; this only refuses what is
// not the shape the command's type describes.

import { FightCommandError } from "./commandError.ts";

const MAX_CONDITIONS = 50;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuse(message: string): never {
  throw new FightCommandError(400, message);
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isCount = (value: unknown): value is number => isWhole(value) && value >= 0;
const isName = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Every command of the turn reducer that names a creature. */
const NAMES_A_COMBATANT: ReadonlySet<string> = new Set([
  "set_initiative", "adjust_hp", "set_hp", "set_max_hp", "set_temp_hp", "apply_condition", "remove_condition", "set_conditions",
  "resolve_condition_save", "settle_ongoing_damage", "end_concentration", "enter_wildshape", "revert_wildshape", "set_size_override",
  "toggle_surprised", "toggle_reaction", "set_reaction_used", "record_move", "undo_move", "set_action_used", "set_bonus_used",
  "spend_legendary_actions", "remove_combatant", "use_action", "restore_action",
]);

function validCondition(value: unknown): boolean {
  return isRecord(value) && isName(value.name);
}

/** Refuses (400) a reducer command whose numbers, flags or lists are not the shape `EncounterTurnCommand` describes. */
export function validateReducerCommand(command: Record<string, unknown>): void {
  const type = String(command.type);
  if (NAMES_A_COMBATANT.has(type) && !isName(command.instanceId)) refuse(`${type} needs an instanceId.`);
  switch (type) {
    case "set_initiative":
      // A blank (null) clears the roll; a roll is a finite number.
      if (command.value !== null && (typeof command.value !== "number" || !Number.isFinite(command.value))) refuse("set_initiative needs a number, or null to clear it.");
      break;
    case "adjust_hp":
      if (!isWhole(command.delta)) refuse("adjust_hp needs a whole number delta.");
      if (command.critical !== undefined && typeof command.critical !== "boolean") refuse("adjust_hp: critical must be true or false.");
      break;
    case "set_hp":
    case "set_max_hp":
    case "set_temp_hp":
      if (!isCount(command.value)) refuse(`${type} needs a whole number value of 0 or more.`);
      break;
    case "apply_condition":
      if (!validCondition(command.condition)) refuse("apply_condition needs a condition with a name.");
      break;
    case "set_conditions":
      if (!Array.isArray(command.conditions) || command.conditions.length > MAX_CONDITIONS || !command.conditions.every(validCondition)) {
        refuse(`set_conditions needs a list of at most ${MAX_CONDITIONS} conditions, each with a name.`);
      }
      break;
    case "remove_condition":
    case "settle_ongoing_damage":
      if (!isName(command.name)) refuse(`${type} needs the name of a condition.`);
      break;
    case "resolve_condition_save":
      if (!isName(command.name) || typeof command.success !== "boolean") refuse("resolve_condition_save needs the name of a condition and a success of true or false.");
      break;
    case "end_concentration":
      if (command.spell !== undefined && typeof command.spell !== "string") refuse("end_concentration: spell must be a name.");
      break;
    case "enter_wildshape":
      if (!isRecord(command.form) || !isCount(command.wildshapesUsed)) refuse("enter_wildshape needs a form and a whole number of wildshapes used.");
      if (command.tempHp !== undefined && !isCount(command.tempHp)) refuse("enter_wildshape: tempHp must be a whole number of 0 or more.");
      break;
    case "set_size_override":
      if (command.size !== null && typeof command.size !== "string") refuse("set_size_override needs a size, or null.");
      break;
    case "set_reaction_used":
    case "set_action_used":
    case "set_bonus_used":
      if (typeof command.used !== "boolean") refuse(`${type} needs used as true or false.`);
      break;
    case "record_move":
    case "undo_move":
      // Feet are charged in whole 5-foot squares (`src/lib/battlemap/movement.ts`).
      if (!isCount(command.feet)) refuse(`${type} needs a whole number of feet, 0 or more.`);
      break;
    case "prime_legendary_actions":
      if (!isRecord(command.caps) || !Object.values(command.caps).every(isCount)) refuse("prime_legendary_actions needs caps mapping instance ids to whole numbers.");
      break;
    case "spend_legendary_actions":
      if (!isCount(command.cost)) refuse("spend_legendary_actions needs a whole number cost of 0 or more.");
      break;
    case "set_boss_mechanics":
      if (typeof command.lairEnabled !== "boolean" || (command.lairOwnerInstanceId !== null && typeof command.lairOwnerInstanceId !== "string")) {
        refuse("set_boss_mechanics needs lairEnabled as true or false and a lairOwnerInstanceId, or null.");
      }
      break;
    case "use_action": {
      if (!isName(command.action)) refuse("use_action needs the name of the action.");
      const limit = command.limit;
      if (!isRecord(limit)) refuse("use_action needs the limit of the action.");
      const { recharge, per_day: perDay } = limit as Record<string, unknown>;
      if (perDay !== undefined && !isCount(perDay)) refuse("use_action: per_day must be a whole number of 0 or more.");
      if (recharge !== undefined && (!isRecord(recharge) || !isCount(recharge.min) || !isCount(recharge.max))) refuse("use_action: recharge needs a whole number min and max.");
      break;
    }
    case "restore_action":
      if (!isName(command.action)) refuse("restore_action needs the name of the action.");
      break;
  }
}

/** A list of combatants a caller built: the fields a crash would follow are checked, the rest is the reducer's business. */
export function validateCombatants(commandType: string, list: unknown, limit: number): void {
  if (!Array.isArray(list) || list.length < 1 || list.length > limit) refuse(`${commandType} needs between 1 and ${limit} combatants.`);
  const seen = new Set<string>();
  for (const c of list as unknown[]) {
    if (
      !isRecord(c) || !isName(c.instance_id) || (c.type !== "player" && c.type !== "monster") || typeof c.name !== "string"
      || !isWhole(c.hp) || !isCount(c.max_hp)
    ) {
      refuse("Every combatant needs an instance_id, a type of player or monster, a name, and whole number hp and max_hp (max_hp 0 or more).");
    }
    const one = c as Record<string, unknown>;
    // The reducer reads these three on every command, so a combatant saved without them breaks the fight for good.
    const saves = one.death_saves;
    if (
      !Array.isArray(one.conditions) || !Array.isArray(one.curses) || !isRecord(saves)
      || typeof saves.successes !== "number" || !Number.isFinite(saves.successes) || typeof saves.failures !== "number" || !Number.isFinite(saves.failures)
    ) {
      refuse("Every combatant needs a conditions list, a curses list and death_saves with numbers for successes and failures.");
    }
    // Every other command finds a combatant by its instance id, so a second one with the same id could never be reached.
    if (seen.has(one.instance_id as string)) refuse(`Two combatants share the instance_id ${one.instance_id}.`);
    seen.add(one.instance_id as string);
  }
}
