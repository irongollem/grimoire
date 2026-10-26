import type { AiProvenance } from "@/ai/provenance";
import { linkInsert } from "@/lib/worldLinks/connections";
import { linkTypeFor, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { ExtractedBondType, ExtractedStance } from "@/types/documentImport.types";
import { normalizeEntityName } from "./entityName";
import type { NameLookupRow } from "./importPlan";
import type { EntityWorldLinks } from "./normalize";

/** A `world_links` row ready to insert: the ends `linkInsert` builds, plus the campaign and provenance. */
export interface WorldLinkWrite {
  campaign_id: string;
  from_kind: LinkKind;
  to_kind: LinkKind;
  type: string;
  ai_provenance: AiProvenance;
  /** The `from_*_id` / `to_*_id` end columns. */
  [column: string]: string | AiProvenance;
}

/** A name that matched nothing, or a type the catalogue does not hold for the pair. */
export interface UnresolvedWorldLink {
  sourceKind: "npcs" | "factions";
  sourceId: string;
  /** What the missing end is, for the message ("person", "faction", "location"). */
  targetLabel: string;
  name: string;
}

export interface PlannedWorldLinks {
  writes: WorldLinkWrite[];
  unresolved: UnresolvedWorldLink[];
}

/**
 * How each extracted bond type becomes a catalogue key. `named` is the person
 * the entry names, `self` the NPC it sits on. A symmetric type is stored with
 * its ends ordered by the database, so which of them is `from` here is moot;
 * a directed one is stored from the person it is "of" ("mentor of" from the
 * mentor), so `namedIsFrom` says whether the named person is that one.
 */
const BOND_TO_CATALOGUE: Record<ExtractedBondType, { key: string; namedIsFrom: boolean }> = {
  friend: { key: "friend", namedIsFrom: true },
  ally: { key: "ally", namedIsFrom: true },
  lover: { key: "lover", namedIsFrom: true },
  contact: { key: "contact", namedIsFrom: true },
  rival: { key: "rival", namedIsFrom: true },
  enemy: { key: "enemy", namedIsFrom: true },
  chosen_family: { key: "chosen_family", namedIsFrom: true },
  former_ally: { key: "former_ally", namedIsFrom: true },
  former_enemy: { key: "former_enemy", namedIsFrom: true },
  mentor: { key: "mentor_of", namedIsFrom: true },
  apprentice: { key: "mentor_of", namedIsFrom: false },
  superior: { key: "superior_of", namedIsFrom: true },
  subordinate: { key: "superior_of", namedIsFrom: false },
  employer: { key: "employer_of", namedIsFrom: true },
  employee: { key: "employer_of", namedIsFrom: false },
  patron: { key: "patron_of", namedIsFrom: true },
  protege: { key: "patron_of", namedIsFrom: false },
};

/** Words a model reaches for that are not in the enum, mapped to the nearest bond; anything else is dropped. */
const BOND_ALIASES: Readonly<Record<string, ExtractedBondType>> = {
  friends: "friend", allies: "ally", lovers: "lover", rivals: "rival", enemies: "enemy",
  teacher: "mentor", master: "mentor", student: "apprentice", pupil: "apprentice",
  boss: "superior", commander: "superior", servant: "subordinate", underling: "subordinate",
  employee_of: "employee", protegee: "protege",
};

const STANCE_ALIASES: Readonly<Record<string, ExtractedStance>> = {
  ally: "allied", allies: "allied", friend: "friendly", enemy: "hostile", enemies: "hostile", at_war: "hostile",
  distrustful: "suspicious", wary: "suspicious",
};

function snake(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : null;
}

function bondFor(raw: unknown): { key: string; namedIsFrom: boolean } | null {
  const word = snake(raw);
  if (word === null) return null;
  const type = word in BOND_TO_CATALOGUE ? (word as ExtractedBondType) : BOND_ALIASES[word];
  const found = type === undefined ? undefined : BOND_TO_CATALOGUE[type];
  // The catalogue has the last word: a type it does not hold for two people is dropped, never inserted raw.
  return found && linkTypeFor("npc", "npc", found.key) ? found : null;
}

function stanceFor(raw: unknown): string | null {
  const word = snake(raw);
  if (word === null) return null;
  const key = STANCE_ALIASES[word] ?? word;
  return linkTypeFor("faction", "faction", key) ? key : null;
}

function nameIndex(rows: readonly NameLookupRow[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeEntityName(row.name);
    if (key !== null && !byName.has(key)) byName.set(key, row.id);
  }
  return byName;
}

function find(index: ReadonlyMap<string, string>, name: unknown): string | undefined {
  const key = typeof name === "string" ? normalizeEntityName(name) : null;
  return key === null ? undefined : index.get(key);
}

export interface WorldLinkLookups {
  npcs: readonly NameLookupRow[];
  factions: readonly NameLookupRow[];
  locations: readonly NameLookupRow[];
}

/**
 * Turns the ties each imported NPC and faction names into `world_links` rows
 * (#1084), always in the direction the catalogue stores them:
 *
 *  - an NPC's bond is read from the named person ("Orsik, the smith's mentor"
 *    is `mentor_of` from Orsik to the smith);
 *  - a faction's places and stances are held by the faction, so they are stored
 *    from it.
 *
 * The first statement of a pair wins: a page states a friendship from both ends,
 * and `world_links` holds it once, so the second is dropped here rather than
 * refused by the database. A stance is one per direction whatever its type.
 */
export function planWorldLinks(
  npcRows: readonly { id: string; links: object }[],
  factionRows: readonly { id: string; links: object }[],
  lookups: WorldLinkLookups,
  campaignId: string,
  provenance: AiProvenance,
): PlannedWorldLinks {
  const npcs = nameIndex(lookups.npcs);
  const factions = nameIndex(lookups.factions);
  const locations = nameIndex(lookups.locations);

  const writes: WorldLinkWrite[] = [];
  const unresolved: UnresolvedWorldLink[] = [];
  const seen = new Set<string>();

  const add = (
    subject: { kind: LinkKind; id: string },
    other: { kind: LinkKind; id: string },
    choice: { key: string; subjectIsFrom: boolean },
    exclusive: boolean,
  ) => {
    const from = choice.subjectIsFrom ? subject : other;
    const to = choice.subjectIsFrom ? other : subject;
    // Symmetric types are stored ordered, so the pair is the same whichever end was named first.
    const sym = linkTypeFor(from.kind, to.kind, choice.key)?.symmetric === true;
    const ends = sym ? [from.id, to.id].sort() : [from.id, to.id];
    const dedupe = `${exclusive ? "stance" : choice.key}|${ends.join("|")}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    writes.push({ ...linkInsert(subject, other, choice), campaign_id: campaignId, ai_provenance: provenance });
  };

  for (const row of npcRows) {
    for (const bond of (row.links as EntityWorldLinks).bonds ?? []) {
      const otherId = find(npcs, bond.name);
      const mapped = bondFor(bond.type);
      if (otherId === undefined || mapped === null) {
        unresolved.push({ sourceKind: "npcs", sourceId: row.id, targetLabel: otherId === undefined ? "person" : "bond", name: bond.name });
        continue;
      }
      if (otherId === row.id) continue;
      add({ kind: "npc", id: otherId }, { kind: "npc", id: row.id }, { key: mapped.key, subjectIsFrom: mapped.namedIsFrom }, false);
    }
  }

  for (const row of factionRows) {
    const links = row.links as EntityWorldLinks;
    const places: [readonly string[] | undefined, string][] = [
      [links.location_names, "operates_in"],
      [links.controlled_location_names, "controls"],
    ];
    for (const [names, key] of places) {
      for (const name of names ?? []) {
        const placeId = find(locations, name);
        if (placeId === undefined) {
          unresolved.push({ sourceKind: "factions", sourceId: row.id, targetLabel: "location", name });
          continue;
        }
        add({ kind: "faction", id: row.id }, { kind: "location", id: placeId }, { key, subjectIsFrom: true }, false);
      }
    }
    for (const stance of links.stances ?? []) {
      const otherId = find(factions, stance.name);
      const key = stanceFor(stance.stance);
      if (otherId === undefined || key === null) {
        unresolved.push({ sourceKind: "factions", sourceId: row.id, targetLabel: otherId === undefined ? "faction" : "stance", name: stance.name });
        continue;
      }
      if (otherId === row.id) continue;
      add({ kind: "faction", id: row.id }, { kind: "faction", id: otherId }, { key, subjectIsFrom: true }, true);
    }
  }

  return { writes, unresolved };
}
