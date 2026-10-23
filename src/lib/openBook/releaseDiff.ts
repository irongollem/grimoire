import type { OpenBookSnapshot } from "@/types/openBook.types";

/** The sections of a snapshot that hold entries a visitor can open, in reading order. */
export const DIFF_SECTIONS = ["places", "folk", "factions", "pantheons", "deities", "lore", "sessions"] as const;
export type DiffSection = (typeof DIFF_SECTIONS)[number];

export const DIFF_SECTION_LABELS: Record<DiffSection, string> = {
  places: "Places",
  folk: "Folk",
  factions: "Factions",
  pantheons: "Pantheons",
  deities: "Deities",
  lore: "Lore",
  sessions: "Sessions",
};

export interface DiffItem {
  section: DiffSection;
  id: string;
  name: string;
}

export interface ReleaseDiff {
  /** In the book as it stands, not in the live release. */
  added: DiffItem[];
  /** In both, with different content. */
  revised: DiffItem[];
  /** In the live release, no longer in the book. */
  removed: DiffItem[];
}

type SectionEntry = { id: string } & ({ name: string } | { title: string });

function entryName(entry: SectionEntry): string {
  return "name" in entry ? entry.name : entry.title;
}

function entries(snapshot: OpenBookSnapshot, section: DiffSection): SectionEntry[] {
  return snapshot[section];
}

/**
 * What a release made now would change for visitors, set against the live one. By id per section: an entry is
 * new when only the preview has it, taken out when only the live release has it, revised when both do and
 * their stored content differs. `live` null means nothing is open yet, so everything is new.
 */
export function diffSnapshots(preview: OpenBookSnapshot, live: OpenBookSnapshot | null): ReleaseDiff {
  const diff: ReleaseDiff = { added: [], revised: [], removed: [] };
  for (const section of DIFF_SECTIONS) {
    const now = entries(preview, section);
    const before = live ? entries(live, section) : [];
    const beforeById = new Map(before.map((entry) => [entry.id, entry]));
    const nowIds = new Set(now.map((entry) => entry.id));
    for (const entry of now) {
      const old = beforeById.get(entry.id);
      const item: DiffItem = { section, id: entry.id, name: entryName(entry) };
      if (old === undefined) diff.added.push(item);
      else if (JSON.stringify(old) !== JSON.stringify(entry)) diff.revised.push(item);
    }
    for (const entry of before) {
      if (!nowIds.has(entry.id)) diff.removed.push({ section, id: entry.id, name: entryName(entry) });
    }
  }
  return diff;
}

export interface DiffGroup {
  section: DiffSection;
  label: string;
  names: string[];
}

/** The items of one kind of change, grouped by section in reading order. */
export function groupBySection(items: DiffItem[]): DiffGroup[] {
  return DIFF_SECTIONS.flatMap((section) => {
    const names = items.filter((item) => item.section === section).map((item) => item.name);
    return names.length > 0 ? [{ section, label: DIFF_SECTION_LABELS[section], names }] : [];
  });
}

export function diffIsEmpty(diff: ReleaseDiff): boolean {
  return diff.added.length === 0 && diff.revised.length === 0 && diff.removed.length === 0;
}
