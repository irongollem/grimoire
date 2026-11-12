/*
 * The campaign's entries the book kit offers (#1176 frame 13), as one flat
 * list, and the search over it. Pure: the composable gathers the rows, this
 * orders and filters them, so the rules are tested without a campaign.
 */
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";
import { LOCATION_TYPE_COLORS, type LocationType } from "@/types/location.types";
import { MONSTER_TYPES } from "@/types/monster.types";
import type { NpcStatus } from "@/types/npc.types";
import { SPELL_SCHOOLS } from "@/types/spell.types";

export interface KitCampaignEntry {
  id: string;
  type: EntityEmbedType;
  name: string;
  /** "Medium humanoid, CR 1/2": a second line when there is one. */
  subtitle: string | null;
  /**
   * The colour the rest of the app gives this entry (a spell's school, a monster's type, an NPC's
   * status, a place's type), drawn as a dot so two entries of one name can be told apart at a glance.
   */
  dot: string | null;
}

/*
 * Each reads a value straight from a row, which the database holds as free text: an unknown one
 * gets no dot rather than a `var(--school-undefined)` that paints nothing.
 */
export function spellDot(school: string): string | null {
  return (SPELL_SCHOOLS as readonly string[]).includes(school) ? `var(--school-${school})` : null;
}
export function monsterDot(type: string): string | null {
  return (MONSTER_TYPES as readonly string[]).includes(type) ? `var(--monstertype-${type})` : null;
}
const NPC_STATUS_DOT: Record<NpcStatus, string> = {
  alive: "var(--tone-success)",
  dead: "var(--tone-danger)",
  missing: "var(--tone-caution)",
  unknown: "var(--muted-foreground)",
};
export function npcDot(status: NpcStatus): string {
  return NPC_STATUS_DOT[status] ?? NPC_STATUS_DOT.unknown;
}
/** "Human · Blacksmith", and the status when it is news: the old Insert panel's chip said who is dead, which a dot's colour alone cannot. */
export function npcSubtitle(npc: { race: string | null; occupation: string | null; status: NpcStatus }): string | null {
  const status = npc.status === "alive" || npc.status === "unknown" ? null : npc.status;
  return [npc.race, npc.occupation, status].filter(Boolean).join(" · ") || null;
}
export function locationDot(type: LocationType): string | null {
  return LOCATION_TYPE_COLORS[type] ?? null;
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
