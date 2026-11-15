/**
 * What a fight adopts from a player's own `party_members` row, decided as a
 * pure function: the row is the authority for whatever the player changed on
 * their own sheet, and the fight takes it verbatim without writing it back
 * (a write would echo our own ring). Moved out of the runner's party sync and
 * the encounterRun store's `ingest*` functions so a server applies a row by the
 * same rules. The browser-only guards around it (writes in flight, read ticks)
 * stay in the composable: they are about when to apply a row, never what to do.
 */
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant, WildshapeState } from "@/types/encounter.types";
import { deepEqual } from "../../lib/deepEqual.ts";
import { sameConditions } from "../conditions.ts";
import { applyFightCommand } from "./fightCommands.ts";
import { checkFightEvents, type FightDeps } from "./fightEvents.ts";
import type { FightEffect, FightState } from "./fightState.ts";

/** The `party_members` columns a fight reads, and no others. */
export interface PartyIngestRow {
  id: string;
  current_hp: number;
  temp_hp: number;
  current_initiative: number | null;
  conditions: AppliedCondition[];
  concentration: { spellName: string } | null;
  wildshape_state: WildshapeState | null;
  death_save_successes: number;
  death_save_failures: number;
}

/** What the fight last knew that the row cannot say. */
export interface PartyIngestContext {
  /** Whether the encounter is live. A row read before the lobby opens still carries last session's initiative. */
  live: boolean;
  /** The spell this member was last read concentrating on: null for none, undefined when never read before. */
  lastConcentration: string | null | undefined;
}

export interface PartyIngestResult {
  state: FightState;
  effects: FightEffect[];
  /** False when the fight has no combatant for this row; nothing else in the result means anything then. */
  matched: boolean;
  /** The spell the row says the member now concentrates on, for the caller to remember as `lastConcentration`. */
  concentration: string | null;
}

function replaceCombatant(state: FightState, instanceId: string, edit: (c: RunCombatant) => RunCombatant): FightState {
  return { ...state, combatants: state.combatants.map((c) => (c.instance_id === instanceId ? edit(c) : c)) };
}

/** Adopt a temp-HP value that came FROM party_members (the player changed it on
 *  their own sheet). Assigns verbatim — no max(), no persist — because the DB row
 *  is the authority here and writing back would echo our own realtime event. */
export function adoptTempHp(state: FightState, instanceId: string, value: number): FightState {
  return replaceCombatant(state, instanceId, (c) => ({ ...c, temp_hp: value > 0 ? value : undefined }));
}

/** Adopt a beast form taken or dropped outside the runner (the player's own
 *  sheet), without writing it back. Same reasoning as adoptTempHp: the row is
 *  the authority, and a runner that does not know about the form damages the
 *  druid instead of the beast and then persists the form away. */
export function adoptWildshape(state: FightState, instanceId: string, form: WildshapeState | null): FightState {
  return replaceCombatant(state, instanceId, (c) => ({ ...c, wildshape: form ? { ...form } : undefined }));
}

/** Adopt HP from party_members without writing it back. Rows are
 *  authoritative and must not create a second mutation or an echo loop.
 *  Does not run the event check; `ingestPartyRow` does, after it. */
export function adoptHp(state: FightState, instanceId: string, value: number): FightState {
  return replaceCombatant(state, instanceId, (c) => {
    if (c.wildshape && c.wildshape.beast_max_hp !== null) {
      const beastHp = Math.min(c.wildshape.beast_max_hp, Math.max(0, value));
      return { ...c, wildshape: beastHp === 0 ? undefined : { ...c.wildshape, beast_hp: beastHp } };
    }
    return {
      ...c,
      // Healing from 0 ends the dying state, wherever it was done.
      death_saves: c.hp <= 0 && value > 0 ? { successes: 0, failures: 0 } : c.death_saves,
      hp: Math.min(c.max_hp, Math.max(0, value)),
    };
  });
}

/** Adopt death saves rolled outside the runner (the player's own sheet), without writing back. */
export function adoptDeathSaves(state: FightState, instanceId: string, saves: { successes: number; failures: number }): FightState {
  return replaceCombatant(state, instanceId, (c) => ({ ...c, death_saves: { ...saves } }));
}

/** Adopt conditions from party_members without persisting the same row. */
export function adoptConditions(state: FightState, instanceId: string, conditions: AppliedCondition[]): FightState {
  return replaceCombatant(state, instanceId, (c) => ({ ...c, conditions: [...conditions] }));
}

/**
 * Apply one party_members row to the fight, field by field in a fixed order
 * (temp HP, conditions, concentration, beast form, death saves, initiative, HP),
 * each only when it differs from what the fight holds. Shared by the ring
 * re-read and the post-gap resync, so a recovered row lands through exactly the
 * same rules. Ending concentration and setting initiative go through the turn
 * reducer's own commands, so what they raise comes back as effects.
 */
export function ingestPartyRow(
  state: FightState,
  row: PartyIngestRow,
  context: PartyIngestContext,
  deps: FightDeps,
): PartyIngestResult {
  const first = state.combatants.find((c) => c.party_member_id === row.id);
  const spell = row.concentration?.spellName ?? null;
  if (!first) return { state, effects: [], matched: false, concentration: spell };
  const id = first.instance_id;
  const live = () => {
    const c = current.combatants.find((x) => x.instance_id === id);
    if (!c) throw new Error(`Combatant ${id} left the fight while its party row was applied.`);
    return c;
  };
  let current = state;
  const effects: FightEffect[] = [];

  // Temp HP the player granted themselves (or spent) on their own sheet.
  if ((live().temp_hp ?? 0) !== (row.temp_hp ?? 0)) current = adoptTempHp(current, id, row.temp_hp ?? 0);

  // A re-read selects its columns, so none is ever omitted the way an UPDATE
  // payload omitted an unchanged TOAST column: an empty array is a real empty.
  if (!sameConditions(live().conditions, row.conditions)) current = adoptConditions(current, id, row.conditions);

  // A spell the player stopped concentrating on, or swapped for another, on
  // their own sheet (or through any runner path that ends it via the sheet):
  // what that concentration held on others ends with it (#1018). The first
  // read of a member only records what they hold.
  const before = context.lastConcentration ?? null;
  if (context.lastConcentration !== undefined && before !== null && before !== spell) {
    const ended = applyFightCommand(current, { type: "end_concentration", instanceId: id, spell: before }, deps);
    current = ended.state;
    effects.push(...ended.effects);
  }

  // A form the player took or dropped on their own sheet. Compared
  // structurally: the row is jsonb, whose key order is Postgres's own, never
  // the order the client built.
  if (!deepEqual(live().wildshape ?? null, row.wildshape_state ?? null)) {
    current = adoptWildshape(current, id, row.wildshape_state ?? null);
  }

  // Death saves a player rolled on their own sheet. Without this the runner
  // keeps the tally from when the fight began, and end of combat writes it
  // straight back over the character's real one.
  if (live().death_saves.successes !== row.death_save_successes || live().death_saves.failures !== row.death_save_failures) {
    current = adoptDeathSaves(current, id, { successes: row.death_save_successes, failures: row.death_save_failures });
  }

  // Ingest player-rolled initiative (#504). Only apply a fresh non-null value
  // that differs: this keeps the player's own roll and lets "Roll Initiative"
  // skip anyone who already rolled. Only while live: a row read before the
  // lobby opens still carries last session's roll, and the runner blanks it as
  // the lobby opens.
  if (context.live && row.current_initiative !== null && live().initiative !== row.current_initiative) {
    const set = applyFightCommand(current, { type: "set_initiative", instanceId: id, value: row.current_initiative }, deps);
    current = set.state;
    effects.push(...set.effects);
  }

  if (live().hp !== row.current_hp) {
    current = adoptHp(current, id, row.current_hp);
    const checked = checkFightEvents(current, deps);
    current = checked.state;
    effects.push(...checked.effects);
  }
  return { state: current, effects, matched: true, concentration: spell };
}
