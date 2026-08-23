import type { RollTable } from "@/types/rollTable.types";

/**
 * The roll-table widget's per-instance configuration (#764).
 *
 * Second user of `DashboardLayoutEntry.settings`, and the first whose choice
 * is a *campaign row* rather than a static id. That is the difference worth
 * noting: the DM screen card stores an id from a table shipped in the bundle,
 * so it can validate it at parse time. A roll table's uuid can only be checked
 * against a query, and it can disappear while the layout still names it — the
 * DM deleted it, or switched to a campaign that never had it.
 *
 * So resolution takes the loaded list and answers in three states rather than
 * two, and the widget renders each differently. A card that silently rolled
 * some *other* table after the DM deleted the one it was pinned to would be
 * the worst of the three.
 */

export interface RollTableCardSettings {
  /** Absent on a card the DM has not configured — see `resolveRollTable`. */
  tableId?: string;
}

export type RollTableResolution =
  /** Nothing to roll: the campaign has no roll tables at all. */
  | { state: "none" }
  /** Configured (or defaulted) and present. */
  | { state: "ready"; table: RollTable }
  /** The layout names a table this campaign does not have. */
  | { state: "missing"; tableId: string };

export function parseRollTableCardSettings(raw: unknown): RollTableCardSettings {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const tableId = (raw as Record<string, unknown>).tableId;
    if (typeof tableId === "string" && tableId !== "") return { tableId };
  }
  return {};
}

/**
 * Which table one card should roll.
 *
 * An unconfigured card falls to the first table the campaign has, rather than
 * demanding a trip through the gear before it does anything. `useRollTables`
 * orders by name, so "first" is stable and the DM can predict it — and one
 * click of the gear changes it.
 *
 * A configured id that is not in the list is reported as `missing`, never
 * quietly replaced. The widget says the table is gone; substituting a
 * different one would have the card roll something the DM did not ask for
 * while looking exactly as though it had.
 */
export function resolveRollTable(
  raw: unknown,
  tables: readonly RollTable[],
): RollTableResolution {
  const { tableId } = parseRollTableCardSettings(raw);

  if (tableId === undefined) {
    const first = tables[0];
    return first === undefined ? { state: "none" } : { state: "ready", table: first };
  }

  const table = tables.find((candidate) => candidate.id === tableId);
  return table === undefined ? { state: "missing", tableId } : { state: "ready", table };
}
