import { DM_SCREEN_SECTIONS, type ScreenTable } from "@/data/dmScreen";

/**
 * The DM-screen quick card's per-instance configuration (#764).
 *
 * This is the first widget to use `DashboardLayoutEntry.settings`, and it is
 * why that field was reserved: a paper DM screen holds several different
 * reference tables at once, so "which table" cannot live in the registry — it
 * belongs to the *instance*. Two quick cards side by side showing the same
 * table would be a worse screen than one.
 *
 * Kept pure and apart from the widget for the usual reason: reconciling a
 * stored id against reference data that moves between deploys is exactly the
 * kind of edge work that is cheap to test here and expensive to test through a
 * mounted card.
 */

export interface DmScreenCardSettings {
  tableId: string;
}

/** One row of the settings picker: the table, plus the section it came from. */
export interface DmScreenTableOption {
  id: string;
  /** `EntityCombobox` searches this field, so it is the table's own title. */
  name: string;
  /** Shown beneath the name — "Cover" alone does not say it is a combat table. */
  section: string;
}

/**
 * The DC ladder, not the first table in the data.
 *
 * A quick card added from the shelf has no settings yet and has to show
 * *something* before the DM configures it. "Actions in Combat" is what first
 * happens to be, and it is a ten-row table nobody looks up. Conditions would
 * be the other obvious answer, but that has its own widget in this catalogue —
 * so the default is the one table a DM reaches for several times an hour and
 * which nothing else on the dashboard duplicates.
 */
export const DEFAULT_DM_SCREEN_TABLE_ID = "difficulty-class";

const BY_ID: ReadonlyMap<string, ScreenTable> = new Map(
  DM_SCREEN_SECTIONS.flatMap((section) => section.tables.map((table) => [table.id, table] as const)),
);

export const DM_SCREEN_TABLE_OPTIONS: readonly DmScreenTableOption[] = DM_SCREEN_SECTIONS.flatMap(
  (section) =>
    section.tables.map((table) => ({
      id: table.id,
      name: table.title,
      section: section.title,
    })),
);

/** The reference table for an id, or `undefined` for one the data no longer has. */
export function dmScreenTable(id: string): ScreenTable | undefined {
  return BY_ID.get(id);
}

/**
 * Read an instance's stored blob.
 *
 * Anything unrecognisable resolves to the default id rather than throwing:
 * `settings` is jsonb written by an older build, and a card that quietly shows
 * the DC ladder is a better answer than a card that shows an error.
 */
export function parseDmScreenCardSettings(raw: unknown): DmScreenCardSettings {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const tableId = (raw as Record<string, unknown>).tableId;
    if (typeof tableId === "string" && BY_ID.has(tableId)) return { tableId };
  }
  return { tableId: DEFAULT_DM_SCREEN_TABLE_ID };
}

/**
 * The table an instance should render, or `undefined` when the id it stored is
 * gone *and* so is the default — which only happens if `dmScreen.ts` is
 * gutted. The widget says so rather than rendering an empty grid; there is no
 * honest fallback table to substitute.
 */
export function resolveDmScreenTable(raw: unknown): ScreenTable | undefined {
  return dmScreenTable(parseDmScreenCardSettings(raw).tableId);
}
