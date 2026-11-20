import { reactive, type ComputedRef, type InjectionKey, type Ref } from "vue";
import type { TurnRun } from "@/composables/encounters/useFightCommands";
import type { DamageAmount, useActionResolution } from "@/composables/encounters/useActionResolution";
import type { RollMode } from "@/systems/dnd5e/dice/rollMode";
import type { DamageType } from "@/types/damage.types";

/** What `useActionResolution` returns; the resolve panel hands one instance to its flows. */
export type ActionResolution = ReturnType<typeof useActionResolution>;

/**
 * The runner's roll settings, provided by `RunnerEntityDetail` so every panel
 * that lists actions (monster, NPC, companion, wild shape) rolls with the DM's
 * advantage toggle and chat mode without threading them down as props.
 */
export interface RunnerRollContext {
  rollMode: Ref<RollMode>;
  /** Chat mode "silent": rolls are not posted to the campaign chat. */
  silent: ComputedRef<boolean>;
}

export const RUNNER_ROLL_CONTEXT: InjectionKey<RunnerRollContext> = Symbol("runnerRollContext");

/**
 * "Run this turn for me" (#1203), provided by the runner so every panel that lists a creature's actions can offer it.
 * The last result of each creature is held here, not in the button, so it survives the panel closing and the turn
 * moving on for as long as the runner is open, and is replaced by that creature's next run.
 */
export interface RunnerTakeTurn {
  /** Asks the server to play this creature's turn. Does nothing while a request for it is out. */
  run(instanceId: string): Promise<void>;
  /** The last result per creature (`instance_id`). */
  results: Record<string, TurnRun>;
  /** The server's sentence when the last run of a creature was refused or failed; cleared by its next run. */
  errors: Record<string, string>;
  /** Creatures with a request out. */
  pending: Record<string, true>;
}

export const RUNNER_TAKE_TURN: InjectionKey<RunnerTakeTurn> = Symbol("runnerTakeTurn");

/** Builds the provided object over the runner's `takeTurn`; `messageOf` turns a thrown error into the sentence shown. */
export function createRunnerTakeTurn(takeTurn: (instanceId: string) => Promise<TurnRun>, messageOf: (error: unknown) => string): RunnerTakeTurn {
  const state = reactive<Pick<RunnerTakeTurn, "results" | "errors" | "pending">>({ results: {}, errors: {}, pending: {} });
  return {
    results: state.results,
    errors: state.errors,
    pending: state.pending,
    async run(instanceId) {
      if (state.pending[instanceId]) return;
      state.pending[instanceId] = true;
      delete state.errors[instanceId];
      try {
        state.results[instanceId] = await takeTurn(instanceId);
      } catch (error) {
        state.errors[instanceId] = messageOf(error);
      } finally {
        delete state.pending[instanceId];
      }
    },
  };
}

/**
 * APP CONVENTION (#1021 row 26): the party members the DM's runner lets the AI play, read from the party rows it already holds. For the
 * autopilot's stop and the label only: the server re-reads consent itself and refuses a `take_turn` on anyone else.
 */
export function standInIdsOf(members: readonly { id: string; ai_speaks?: boolean; ai_stands_in?: boolean }[]): ReadonlySet<string> {
  return new Set(members.filter((m) => m.ai_speaks === true && m.ai_stands_in === true).map((m) => m.id));
}

/** The stand-ins of the open fight, provided by the runner for the label beside a name. */
export const RUNNER_STAND_INS: InjectionKey<ComputedRef<ReadonlySet<string>>> = Symbol("runnerStandIns");

type TurnOf = { type?: "player" | "monster"; party_member_id?: string | null; bystander?: true };

/** Autopilot stops at a bystander and at a player a person plays; a stand-in's turn is the AI's, so it runs on. */
export const autopilotStopsAt = (standIns: ReadonlySet<string>) => (now: TurnOf): boolean =>
  now.bystander === true || (now.type === "player" && !(typeof now.party_member_id === "string" && standIns.has(now.party_member_id)));

/** A downed stand-in still takes its turn on autopilot: the server rolls its death save, as the solo host's ally does. */
export const autopilotDownTakesTurn = (standIns: ReadonlySet<string>) => (now: TurnOf): boolean =>
  now.type === "player" && typeof now.party_member_id === "string" && standIns.has(now.party_member_id);

/** A damage amount the DM can correct; null while the field is cleared. */
export interface EditableAmount {
  amount: number | null;
  type: DamageType | null;
}

export function toEditable(amounts: DamageAmount[]): EditableAmount[] {
  return amounts.map((a) => ({ amount: a.amount, type: a.type }));
}

/** A cleared or negative field counts as nothing taken, never as a hidden default. */
export function toDamageAmounts(list: EditableAmount[]): DamageAmount[] {
  return list.map((p) => ({ amount: p.amount === null ? 0 : Math.max(0, Math.floor(p.amount)), type: p.type }));
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
