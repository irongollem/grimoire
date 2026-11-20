/**
 * What a canon entry carries besides its own row, planned into writes (#1226 story 7): who knows a truth
 * (`world_links`, `known_to`), a force's steps and quests, a secret's clues, a lore entry's passages.
 *
 * Pure by the same rule as `importSweepWorldLinks.ts`: names are resolved against lookups the sweep hands in, and
 * nothing here talks to a database. The one rule that matters is the same as everywhere in the sweep: a name that
 * matches nothing, or more than one thing, never becomes a link. It is reported, and a clue or passage whose place
 * could not be named is still written, unplaced, because the line itself is the book's.
 */
import type { AiProvenance } from "@/ai/provenance";
import { linkInsert } from "@/lib/worldLinks/connections";
import { linkTypeFor, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { normalizeEntityName } from "./entityName";
import type { NameLookupRow } from "./importPlan";
import type { EntityCanonLinks } from "./normalize";
import type { WorldLinkWrite } from "./importSweepWorldLinks";

export interface CanonStepWrite {
  campaign_id: string;
  force_id: string;
  title: string;
  sort_order: number;
  ai_provenance: AiProvenance;
}

export interface CanonForceQuestWrite {
  campaign_id: string;
  force_id: string;
  quest_id: string;
}

/** Where a clue or passage lies: at most one of the three, the database's own `one_place` check. */
export interface CanonSpot {
  location_id: string | null;
  npc_id: string | null;
  quest_beat_id: string | null;
}

export interface CanonClueWrite extends CanonSpot {
  campaign_id: string;
  secret_id: string;
  title: string;
  sort_order: number;
  ai_provenance: AiProvenance;
}

export interface CanonPassageWrite extends CanonSpot {
  campaign_id: string;
  entry_id: string;
  title: string;
  body: string | null;
  sort_order: number;
  ai_provenance: AiProvenance;
}

export interface UnresolvedCanonLink {
  sourceId: string;
  /** What the name was for ("who knows it", "quest", "where"), for the message. */
  relation: string;
  name: string;
}

export interface CanonLookups {
  npcs: readonly NameLookupRow[];
  factions: readonly NameLookupRow[];
  /** The campaign's player characters (`party_members`). */
  party: readonly NameLookupRow[];
  locations: readonly NameLookupRow[];
  quests: readonly NameLookupRow[];
  /** Beats of the quests this sweep wrote, by title. An existing quest's beats are not offered. */
  beats: readonly NameLookupRow[];
}

export interface PlannedCanon {
  worldLinks: WorldLinkWrite[];
  steps: CanonStepWrite[];
  forceQuests: CanonForceQuestWrite[];
  clues: CanonClueWrite[];
  passages: CanonPassageWrite[];
  unresolved: UnresolvedCanonLink[];
}

/** Every distinct row of `rows` whose name equals `name` once normalized; two rows of one id count once. */
function matches(rows: readonly NameLookupRow[], name: string): NameLookupRow[] {
  const needle = normalizeEntityName(name);
  if (needle === null) return [];
  const found = new Map<string, NameLookupRow>();
  for (const row of rows) if (normalizeEntityName(row.name) === needle) found.set(row.id, row);
  return [...found.values()];
}

/**
 * The one thing a name means across several kinds, or null when it means nothing or means two (the name of a
 * person who is also a place). Ambiguity is a refusal, not a pick: a wrong tie is worse than a missing one.
 */
function theOne<K extends string>(candidates: readonly { kind: K; rows: readonly NameLookupRow[] }[], name: string): { kind: K; id: string } | null {
  const hits: { kind: K; id: string }[] = [];
  for (const { kind, rows } of candidates) for (const row of matches(rows, name)) hits.push({ kind, id: row.id });
  return hits.length === 1 ? hits[0]! : null;
}

function spotFor(where: string, lookups: CanonLookups): CanonSpot | null {
  const hit = theOne(
    [
      { kind: "location_id", rows: lookups.locations },
      { kind: "npc_id", rows: lookups.npcs },
      { kind: "quest_beat_id", rows: lookups.beats },
    ] as const,
    where,
  );
  if (!hit) return null;
  return { location_id: null, npc_id: null, quest_beat_id: null, [hit.kind]: hit.id };
}

const NO_SPOT: CanonSpot = { location_id: null, npc_id: null, quest_beat_id: null };

export function planCanonChildren(
  rows: readonly { id: string; links: object }[],
  lookups: CanonLookups,
  campaignId: string,
  provenance: AiProvenance,
): PlannedCanon {
  const planned: PlannedCanon = { worldLinks: [], steps: [], forceQuests: [], clues: [], passages: [], unresolved: [] };

  for (const row of rows) {
    const canon = (row.links as EntityCanonLinks).canon;
    if (!canon) continue;

    // Who knows it: a person, a player character or a faction, never two things at once.
    const knowers = new Set<string>();
    for (const name of canon.known_to) {
      const hit = theOne(
        [
          { kind: "npc", rows: lookups.npcs },
          { kind: "party_member", rows: lookups.party },
          { kind: "faction", rows: lookups.factions },
        ] as const satisfies readonly { kind: LinkKind; rows: readonly NameLookupRow[] }[],
        name,
      );
      const choice = hit ? linkTypeFor("canon", hit.kind, "known_to") : null;
      if (!hit || !choice) {
        planned.unresolved.push({ sourceId: row.id, relation: "who knows it", name });
        continue;
      }
      if (knowers.has(`${hit.kind}:${hit.id}`)) continue;
      knowers.add(`${hit.kind}:${hit.id}`);
      planned.worldLinks.push({
        ...linkInsert({ kind: "canon", id: row.id }, { kind: hit.kind, id: hit.id }, { key: "known_to", subjectIsFrom: true }),
        campaign_id: campaignId,
        ai_provenance: provenance,
      });
    }

    canon.steps.forEach((title, i) => {
      planned.steps.push({ campaign_id: campaignId, force_id: row.id, title, sort_order: i, ai_provenance: provenance });
    });

    const seenQuests = new Set<string>();
    for (const name of canon.quests) {
      const found = matches(lookups.quests, name);
      if (found.length !== 1) {
        planned.unresolved.push({ sourceId: row.id, relation: "quest", name });
        continue;
      }
      const questId = found[0]!.id;
      if (seenQuests.has(questId)) continue;
      seenQuests.add(questId);
      planned.forceQuests.push({ campaign_id: campaignId, force_id: row.id, quest_id: questId });
    }

    canon.clues.forEach((clue, i) => {
      let spot = NO_SPOT;
      if (clue.where) {
        const found = spotFor(clue.where, lookups);
        if (found) spot = found;
        else planned.unresolved.push({ sourceId: row.id, relation: "where a clue lies", name: clue.where });
      }
      planned.clues.push({ campaign_id: campaignId, secret_id: row.id, title: clue.title, sort_order: i, ai_provenance: provenance, ...spot });
    });

    canon.passages.forEach((passage, i) => {
      let spot = NO_SPOT;
      if (passage.where) {
        const found = spotFor(passage.where, lookups);
        if (found) spot = found;
        else planned.unresolved.push({ sourceId: row.id, relation: "where a passage comes out", name: passage.where });
      }
      planned.passages.push({
        campaign_id: campaignId,
        entry_id: row.id,
        title: passage.title,
        body: passage.bodyJson,
        sort_order: i,
        ai_provenance: provenance,
        ...spot,
      });
    });
  }

  return planned;
}
