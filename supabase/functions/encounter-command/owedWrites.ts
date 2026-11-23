// The cost of the played character's Reaction (a spell slot, a daily use of an innate spell, a class resource) is written to their sheet AFTER the
// fight is saved, as every ally's cost is, and a write that fails there is only reported. For an ordinary ally that is the existing rule: their
// sheet is the DM's to mend. For the person's own Reaction it would leave the fight with Shield up and the slot unspent for good, because the
// retried batch is answered as already applied before any write runs. So the answer's save carries what it still owes in the same update
// (`encounter_state.owed_writes`, atomic with the fight), the writes are tried, and the record is cleared only when they all landed. A batch
// that finds one still there settles it first. Every write is an absolute value, so settling twice changes nothing the second time.
// Pure; `handler.ts` wires it in.

import type { SpellSlotEntry } from "../../../src/types/party.types.ts";
import type { StoredClassResources } from "../../../src/rules/features/characterFeatures.ts";

/** What an answer's batch still owes the sheets. */
export interface OwedWrites {
  /** The batch whose save recorded it: only that record is cleared by its own settling. */
  batchId: string;
  slots: Array<{ memberId: string; slots: SpellSlotEntry[] }>;
  innate: Array<{ memberId: string; spellRowId: string; remaining: number }>;
  resources: Array<{ memberId: string; resources: StoredClassResources }>;
}

/** The costs a batch spent, as `attempt` lists them (a cast after a cast of the same member is a later, whole list). */
export type SpentCosts = Pick<OwedWrites, "slots" | "innate" | "resources">;

/** One absolute write per member (slots, resources) or grant (innate): the last one the batch made. */
export function lastCosts(spent: SpentCosts): SpentCosts {
  const slots = new Map(spent.slots.map((w) => [w.memberId, w]));
  const innate = new Map(spent.innate.map((w) => [w.spellRowId, w]));
  const resources = new Map(spent.resources.map((w) => [w.memberId, w]));
  return { slots: [...slots.values()], innate: [...innate.values()], resources: [...resources.values()] };
}

/** The record an answer's save carries, or null when the turn spent nothing on a sheet. */
export function owedOf(batchId: string, spent: SpentCosts): OwedWrites | null {
  const last = lastCosts(spent);
  if (last.slots.length + last.innate.length + last.resources.length === 0) return null;
  return { batchId, ...last };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What the jsonb column reads back as: null for nothing owed, `"malformed"` for something this code did not write. */
export function parseOwedWrites(value: unknown): OwedWrites | null | "malformed" {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.batchId !== "string") return "malformed";
  const { slots, innate, resources } = value;
  if (!Array.isArray(slots) || !slots.every((w) => isRecord(w) && typeof w.memberId === "string" && Array.isArray(w.slots))) return "malformed";
  if (!Array.isArray(innate) || !innate.every((w) => isRecord(w) && typeof w.memberId === "string" && typeof w.spellRowId === "string" && typeof w.remaining === "number")) return "malformed";
  if (!Array.isArray(resources) || !resources.every((w) => isRecord(w) && typeof w.memberId === "string" && isRecord(w.resources))) return "malformed";
  return value as unknown as OwedWrites;
}
