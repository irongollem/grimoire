import { sortLore } from "./canonLore";
import { tickTitle } from "./canonChronicle";
import type { CanonEntry, CanonForceTick } from "@/types/canon.types";

/**
 * The canon's dated things as the Calendar's timeline shows them, for the DM only (#1255 item 19). They are read from
 * `canon_entries` and `canon_force_ticks` and never written into `calendar_events`: nothing is copied, so there is
 * nothing to fall out of step, and the Calendar cannot edit or drag them.
 */

export interface CanonCalendarItem {
  key: string;
  /** The small word on it: "Lore", or "A force moved". */
  label: "Lore" | "A force moved";
  title: string;
  year: number;
  month: number | null;
  day: number | null;
  /** Where it is edited: the lore entry, or the force that moved. */
  to: { path: string; query: Record<string, string> };
}

/** Dated lore, then force ticks that carry a world date, in world order. Undated ones, and ticks of a deleted force, are left out. */
export function canonCalendarItems(input: { lore: readonly CanonEntry[]; forces: readonly CanonEntry[]; ticks: readonly CanonForceTick[] }): CanonCalendarItem[] {
  const forceTitle = new Map(input.forces.filter((f) => f.part === "force").map((f) => [f.id, f.title]));
  const items: (CanonCalendarItem & { world_year: number; world_month: number | null; world_day: number | null })[] = [];
  for (const entry of input.lore) {
    if (entry.part !== "lore" || entry.world_year === null) continue;
    items.push({
      key: `lore:${entry.id}`, label: "Lore", title: entry.title, year: entry.world_year, month: entry.world_month, day: entry.world_day,
      to: { path: "/canon", query: { entry: entry.id } },
      world_year: entry.world_year, world_month: entry.world_month, world_day: entry.world_day,
    });
  }
  for (const tick of input.ticks) {
    const name = forceTitle.get(tick.force_id);
    if (tick.world_year === null || name === undefined) continue;
    items.push({
      key: `tick:${tick.id}`, label: "A force moved", title: tickTitle(name, tick), year: tick.world_year, month: tick.world_month, day: tick.world_day,
      to: { path: "/canon", query: { entry: tick.force_id } },
      world_year: tick.world_year, world_month: tick.world_month, world_day: tick.world_day,
    });
  }
  return sortLore(items).map(({ world_year: _y, world_month: _m, world_day: _d, ...item }) => item);
}

/**
 * Whether the Calendar may read the canon at all. The canon tables are DM-only reads, so for a player (or the DM
 * previewing the player portal) the reads must not even run; the DM's toggle also stops them when it is off.
 */
export function canonOnCalendarEnabled(input: { isDM: boolean; dmPreview: boolean; show: boolean; campaignId: string | null }): boolean {
  return input.isDM && !input.dmPreview && input.show && input.campaignId !== null;
}
