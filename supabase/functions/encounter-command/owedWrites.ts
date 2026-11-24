// The cost of the played character's Reaction (a spell slot, a daily use of an innate spell, a class resource) is taken from their sheet AFTER the
// fight is saved, as every ally's cost is, and a write that fails there is only reported. For an ordinary ally that is the existing rule: their
// sheet is the DM's to mend. For the person's own Reaction it would leave the fight with Shield up and the slot unspent for good, because the
// retried batch is answered as already applied before any write runs. So the answer's save carries what it still owes in the same update
// (`encounter_state.owed_writes`, atomic with the fight), the spends are tried, and the record is cleared only when they all landed. A batch
// that finds one still there settles it first. Each spend is applied once per batch id and member (`public.spend_from_sheet`, #1264), so
// settling twice changes nothing the second time.
// Pure; `handler.ts` wires it in.

import type { SheetSpend } from "../../../src/rules/fight/allies/sheetSpend.ts";

/** What an answer's batch still owes the sheets. */
export interface OwedWrites {
  /** The batch whose save recorded it: only that record is cleared by its own settling, and its spends are applied under this id. */
  batchId: string;
  spends: SheetSpend[];
}

/** The record an answer's save carries, or null when the turn spent nothing from a sheet. */
export function owedOf(batchId: string, spends: SheetSpend[]): OwedWrites | null {
  return spends.length === 0 ? null : { batchId, spends };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value > 0;

function isSheetSpend(value: unknown): boolean {
  if (!isRecord(value) || typeof value.memberId !== "string") return false;
  const { slots, resources, innate } = value;
  return (
    Array.isArray(slots) && slots.every((s) => isRecord(s) && typeof s.level === "number" && (s.pool === null || typeof s.pool === "string") && isCount(s.count)) &&
    Array.isArray(resources) && resources.every((r) => isRecord(r) && typeof r.key === "string" && isCount(r.count) && isRecord(r.fresh)) &&
    Array.isArray(innate) && innate.every((i) => isRecord(i) && typeof i.spellRowId === "string" && isCount(i.count))
  );
}

/** What the jsonb column reads back as: null for nothing owed, `"malformed"` for something this code did not write. */
export function parseOwedWrites(value: unknown): OwedWrites | null | "malformed" {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.batchId !== "string") return "malformed";
  if (!Array.isArray(value.spends) || !value.spends.every(isSheetSpend)) return "malformed";
  return value as unknown as OwedWrites;
}
