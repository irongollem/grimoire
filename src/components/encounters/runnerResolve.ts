import type { ComputedRef, InjectionKey, Ref } from "vue";
import type { DamageAmount, useActionResolution } from "@/composables/encounters/useActionResolution";
import type { RollMode } from "@/lib/dice/dice";
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
