// World links (#1084) as backup and world-bundle files carry them.
//
// Two jobs, both pure so the export -> import round-trip is unit-testable:
//
// 1. `remapLinkEnds` rewrites a link's two ends onto the rows the import created, and says no (null) when an
//    end did not arrive. A link cannot point at a row outside its campaign, so a link with a missing end is
//    left out rather than inserted half-formed.
// 2. `legacyTiesToLinks` reads the six tie tables a file written before the World Web carried
//    (npc_relationships, npc_pc_notes, faction_relations, faction_locations, faction_items) and turns them into
//    links, by the same rules as migration 20261026213604. A downloaded backup is the user's own data, not a
//    surpassed code path: this is its one way in, and the importers read nothing else of the old shape.

import { LINK_KINDS, linkTypeFor, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";

type Row = Record<string, unknown>;

/** Resolves one end of a link in the file to the id it has in the new campaign, or null if it did not come over. */
export type ResolveLinkEnd = (kind: LinkKind, id: string) => string | null;

function isLinkKind(value: unknown): value is LinkKind {
  return LINK_KINDS.some((k) => k === value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** One side of a link row: its kind and the id in whichever `<side>_<kind>_id` column holds it. */
export function linkEnd(row: Row, side: "from" | "to"): { kind: LinkKind; id: string } | null {
  const kind = row[`${side}_kind`];
  if (!isLinkKind(kind)) return null;
  const id = row[`${side}_${kind}_id`];
  return nonEmpty(id) ? { kind, id } : null;
}

/** The twelve end columns of a link, all null but the two that are set. */
function endColumns(from: { kind: LinkKind; id: string }, to: { kind: LinkKind; id: string }): Row {
  const out: Row = { from_kind: from.kind, to_kind: to.kind };
  for (const kind of LINK_KINDS) {
    out[`from_${kind}_id`] = kind === from.kind ? from.id : null;
    out[`to_${kind}_id`] = kind === to.kind ? to.id : null;
  }
  return out;
}

/**
 * A link's end columns rewritten through `resolve`, or null when either end cannot be resolved. Only the
 * kinds and the twelve id columns come back: the generated `from_id` / `to_id` are Postgres's to fill, and
 * the caller brings the rest of the row (campaign, owner, words, audience) itself.
 */
export function remapLinkEnds(link: Row, resolve: ResolveLinkEnd): Row | null {
  const from = linkEnd(link, "from");
  const to = linkEnd(link, "to");
  if (!from || !to) return null;
  const newFrom = resolve(from.kind, from.id);
  const newTo = resolve(to.kind, to.id);
  if (newFrom === null || newTo === null) return null;
  return endColumns({ kind: from.kind, id: newFrom }, { kind: to.kind, id: newTo });
}

// ── Files written before the World Web ──────────────────────────────────────

/** The tie tables an older file may carry. Every array is optional: a file only has what its version wrote. */
export interface LegacyTies {
  npc_relationships?: Row[];
  npc_pc_notes?: Row[];
  faction_relations?: Row[];
  faction_locations?: Row[];
  faction_items?: Row[];
}

/** A directed bond turns round into its stored direction: "B is A's mentor" is a link from B (see the migration). */
const FLIPPED = new Set(["mentor", "superior"]);
const PC_FLIPPED = new Set(["apprentice", "subordinate"]);
const BOND_TYPE: Record<string, string> = {
  mentor: "mentor_of",
  apprentice: "mentor_of",
  superior: "superior_of",
  subordinate: "superior_of",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

interface DraftLink {
  from: { kind: LinkKind; id: string };
  to: { kind: LinkKind; id: string };
  type: string;
  note: string;
  told: string;
  visibleTo: string[];
  provenance: unknown;
  createdAt: unknown;
}

/**
 * Turns the old tie tables into link rows in the file's own id space (the importer remaps them like any other
 * link). Two old rows can become one link (a symmetric bond written once each way), and their notes are kept
 * together, as the migration does. A type outside today's catalogue for its pair becomes the mildest word of
 * the pair, so nothing claims more than the DM wrote.
 */
export function legacyTiesToLinks(old: LegacyTies): Row[] {
  const drafts = new Map<string, DraftLink>();

  const add = (draft: DraftLink): void => {
    const def = linkTypeFor(draft.from.kind, draft.to.kind, draft.type);
    const type = def ? draft.type : draft.from.kind === "faction" && draft.to.kind === "faction" ? "neutral" : "contact";
    const symmetric = linkTypeFor(draft.from.kind, draft.to.kind, type)?.symmetric === true;
    const ends = symmetric ? [draft.from.id, draft.to.id].sort() : [draft.from.id, draft.to.id];
    const key = `${type}|${ends.join("|")}`;
    const link: DraftLink = { ...draft, type };
    const earlier = drafts.get(key);
    if (!earlier) {
      drafts.set(key, link);
      return;
    }
    if (link.note && !earlier.note.includes(link.note)) earlier.note = earlier.note ? `${earlier.note} / ${link.note}` : link.note;
    if (link.told && !earlier.told) earlier.told = link.told;
    earlier.visibleTo = [...new Set([...earlier.visibleTo, ...link.visibleTo])];
  };

  for (const rel of old.npc_relationships ?? []) {
    if (!nonEmpty(rel.npc_id) || !nonEmpty(rel.related_npc_id)) continue;
    const kind = String(rel.relationship_type);
    const a = { kind: "npc" as const, id: rel.npc_id };
    const b = { kind: "npc" as const, id: rel.related_npc_id };
    add({
      from: FLIPPED.has(kind) ? b : a,
      to: FLIPPED.has(kind) ? a : b,
      type: BOND_TYPE[kind] ?? kind,
      note: text(rel.notes),
      told: "",
      visibleTo: [],
      provenance: rel.ai_provenance,
      createdAt: rel.created_at,
    });
  }

  // The old type described the NPC to the PC ("your mentor"), as the player read it: the note is what that player reads.
  for (const note of old.npc_pc_notes ?? []) {
    if (!nonEmpty(note.npc_id) || !nonEmpty(note.party_member_id)) continue;
    const kind = String(note.relationship_type);
    const npc = { kind: "npc" as const, id: note.npc_id };
    const pc = { kind: "party_member" as const, id: note.party_member_id };
    add({
      from: PC_FLIPPED.has(kind) ? pc : npc,
      to: PC_FLIPPED.has(kind) ? npc : pc,
      type: BOND_TYPE[kind] ?? kind,
      note: "",
      told: text(note.notes),
      visibleTo: [note.party_member_id],
      provenance: note.ai_provenance,
      createdAt: note.created_at,
    });
  }

  for (const rel of old.faction_relations ?? []) {
    if (!nonEmpty(rel.faction_id) || !nonEmpty(rel.target_faction_id)) continue;
    add({
      from: { kind: "faction", id: rel.faction_id },
      to: { kind: "faction", id: rel.target_faction_id },
      type: String(rel.relation_type),
      note: text(rel.notes),
      told: "",
      visibleTo: [],
      provenance: undefined,
      createdAt: rel.created_at,
    });
  }

  // The mildest type of each pair: nothing claims more than the DM wrote.
  for (const place of old.faction_locations ?? []) {
    if (!nonEmpty(place.faction_id) || !nonEmpty(place.location_id)) continue;
    add({
      from: { kind: "faction", id: place.faction_id },
      to: { kind: "location", id: place.location_id },
      type: "operates_in",
      note: text(place.notes),
      told: "",
      visibleTo: [],
      provenance: undefined,
      createdAt: place.created_at,
    });
  }
  for (const held of old.faction_items ?? []) {
    // A faction's shared-library item (library_item_id) is not a row of this campaign, so it cannot be a link end.
    if (!nonEmpty(held.faction_id) || !nonEmpty(held.item_id)) continue;
    add({
      from: { kind: "faction", id: held.faction_id },
      to: { kind: "item", id: held.item_id },
      type: "holds",
      note: text(held.notes),
      told: "",
      visibleTo: [],
      provenance: undefined,
      createdAt: held.created_at,
    });
  }

  return [...drafts.values()].map((d) => ({
    id: crypto.randomUUID(),
    ...endColumns(d.from, d.to),
    type: d.type,
    note: d.note,
    told: d.told,
    player_visible_to: d.visibleTo,
    ai_provenance: d.provenance ?? null,
    ...(typeof d.createdAt === "string" ? { created_at: d.createdAt } : {}),
  }));
}
