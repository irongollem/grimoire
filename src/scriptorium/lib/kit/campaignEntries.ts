/*
 * The campaign's entries the book kit offers (#1176 frame 13), as one flat
 * list, and the search over it. Pure: the composable gathers the rows, this
 * orders and filters them, so the rules are tested without a campaign.
 */
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";

export interface KitCampaignEntry {
  id: string;
  type: EntityEmbedType;
  name: string;
  /** "Medium humanoid, CR 1/2": a second line when there is one. */
  subtitle: string | null;
}

/** Kinds in the order the kit lists them when nothing is typed. */
const TYPE_ORDER: readonly EntityEmbedType[] = [
  "monster",
  "npc",
  "location",
  "spell",
  "item",
  "quest",
  "faction",
  "deity",
  "species",
  "subclass",
];

/** How many rows a typed search shows at once. */
export const KIT_ENTRY_LIMIT = 40;
/** How many of each kind show before anything is typed, so one long list does not hide the others. */
export const KIT_PER_KIND = 5;

/**
 * Entries by name; with nothing typed, the first few of each kind, and with a search, every entry whose
 * name or kind it names. `total` is what the search matches, so the list can say there is more.
 */
export function filterKitEntries(
  entries: readonly KitCampaignEntry[],
  query: string,
  kindLabel: (type: EntityEmbedType) => string,
): { shown: KitCampaignEntry[]; total: number } {
  const q = query.trim().toLowerCase();
  const matched = (q
    ? entries.filter((e) => e.name.toLowerCase().includes(q) || kindLabel(e.type).toLowerCase().includes(q))
    : [...entries]
  ).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
  if (q) return { shown: matched.slice(0, KIT_ENTRY_LIMIT), total: matched.length };
  const shown = TYPE_ORDER.flatMap((type) => matched.filter((e) => e.type === type).slice(0, KIT_PER_KIND));
  return { shown, total: matched.length };
}
