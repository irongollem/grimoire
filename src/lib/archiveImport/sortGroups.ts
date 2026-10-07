/**
 * Pure helpers for the sort step of a wiki-export import (#932): pages grouped
 * by the folder they sit in, per-kind counts, and the labels the kind picker
 * shows. A folder is only a way to sort a long list; it is not a record.
 */
import type { ArchivePage, ArchivePageKind } from "./types";

export const ARCHIVE_KIND_LABELS: Record<ArchivePageKind, string> = {
  npc: "NPC",
  location: "Place",
  faction: "Faction",
  quest: "Quest",
  item: "Item",
  note: "Note",
  skip: "Skip",
};

export const ARCHIVE_KIND_PLURALS: Record<ArchivePageKind, string> = {
  npc: "NPCs",
  location: "Places",
  faction: "Factions",
  quest: "Quests",
  item: "Items",
  note: "Notes",
  skip: "Skipped",
};

/** The order kinds are listed in everywhere (sort counts, review sections). */
export const ARCHIVE_KIND_ORDER: readonly ArchivePageKind[] = ["location", "faction", "npc", "item", "quest", "note", "skip"];

export const TOP_LEVEL_FOLDER = "Top level";

export interface PageGroup {
  /** The folder path, `""` for pages at the root. Stable across renders. */
  key: string;
  label: string;
  pages: ArchivePage[];
}

/** Pages grouped by their folder, in the order a folder first appears. */
export function groupPagesByFolder(pages: readonly ArchivePage[]): PageGroup[] {
  const groups = new Map<string, PageGroup>();
  for (const page of pages) {
    const key = page.folders.join("/");
    let group = groups.get(key);
    if (!group) {
      group = { key, label: key === "" ? TOP_LEVEL_FOLDER : page.folders.join(" / "), pages: [] };
      groups.set(key, group);
    }
    group.pages.push(page);
  }
  return [...groups.values()];
}

export function countByKind(pages: readonly ArchivePage[], kinds: ReadonlyMap<string, ArchivePageKind>): Record<ArchivePageKind, number> {
  const out: Record<ArchivePageKind, number> = { npc: 0, location: 0, faction: 0, quest: 0, item: 0, note: 0, skip: 0 };
  for (const page of pages) out[kinds.get(page.ref) ?? page.kind]++;
  return out;
}

/**
 * Which groups start open: small ones, until about `budget` pages are on
 * screen, so a two-thousand-page export opens as a list of folders rather than
 * two thousand selects.
 */
export function initiallyOpenGroups(groups: readonly PageGroup[], smallGroup = 20, budget = 120): Set<string> {
  const open = new Set<string>();
  let shown = 0;
  for (const group of groups) {
    if (group.pages.length > smallGroup || shown + group.pages.length > budget) continue;
    open.add(group.key);
    shown += group.pages.length;
  }
  return open;
}
