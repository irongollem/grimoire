import type { Connection } from "@/types/connections.types";

/**
 * What a force can be "who" (#1279 item 11): a person, a faction or a god. A lone villain, a dragon (an NPC) and a
 * cult (a faction) are all someone who wants something. The tie is the canon's own `about` link from the force.
 */
export const WHO_KINDS = ["npc", "faction", "deity"] as const;
export type WhoKind = (typeof WHO_KINDS)[number];

export const WHO_KIND_LABEL: Record<WhoKind, string> = { npc: "Person", faction: "Faction", deity: "God" };

export interface ForceWho {
  kind: WhoKind;
  id: string;
  name: string;
}

const isWhoKind = (kind: string): kind is WhoKind => (WHO_KINDS as readonly string[]).includes(kind);

/** Whether a connection of a force is one of its "who" ties: the force is `about` a person, faction or god. */
export function isWhoTie(c: Connection): boolean {
  return c.source === "link" && c.type === "about" && c.outward && isWhoKind(c.other_kind);
}

/**
 * Each force's who, by name as it is now: the `about` links from a force to a person, faction or god, joined to those
 * records so a rename reads under its new name. A link whose far end is gone is left out. Links keep the order given.
 */
export function forceWhoMap(
  links: readonly { force_id: string; kind: WhoKind; id: string }[],
  names: ReadonlyMap<string, string>,
): Map<string, ForceWho[]> {
  const who = new Map<string, ForceWho[]>();
  for (const link of links) {
    const name = names.get(`${link.kind}:${link.id}`);
    if (name === undefined) continue;
    who.set(link.force_id, [...(who.get(link.force_id) ?? []), { kind: link.kind, id: link.id, name }]);
  }
  return who;
}

/** "The Ferrymen", "Vexa and The Ferrymen", "A, B and C". */
export function whoLine(who: readonly ForceWho[]): string {
  const names = who.map((w) => w.name);
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Where a who's own page is. */
export function whoPath(w: ForceWho): string {
  return w.kind === "npc" ? `/npcs/${w.id}` : w.kind === "faction" ? `/factions/${w.id}` : `/deities/${w.id}`;
}
