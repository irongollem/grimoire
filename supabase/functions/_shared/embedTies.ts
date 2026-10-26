/**
 * The ties an entity's embed text carries (World Web, #1084): where a person
 * lives, what they belong to, and their `world_links` worded from their own
 * side. embed-content calls `loadTieExtras` for every row it is about to
 * build text for, in every mode (single, many, audit and the batch stale
 * scan), so all of them build identical text. That is the point: the stored
 * `source_hash` is over the text, and the admin backfill after release only
 * finds rows whose ties changed if the stale check reads the ties too.
 *
 * Reads run as the service role, in bulk per chunk of ids, never per row. The
 * results feed embeddings only; they are DM-only (see the migration's RLS on
 * `*_embeddings`, which has no player policy). Nothing here is returned to a
 * caller.
 *
 * The assembling is pure (`assembleTieExtras`) and tested without Deno or a
 * database; only the fetching touches the client, imported as a type so
 * vitest can still load this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddableMembership, TieLink } from "./entityEmbedText.ts";
import { tieNameKey, tieSentences } from "./entityEmbedText.ts";
import type { LinkKind } from "./worldLinkCatalogue.ts";

/** The kinds whose embed text carries ties. */
export type TieSubjectKind = "npc" | "faction" | "location" | "item";

/** What `loadTieExtras` adds to one row; spread into the builder's input. */
export interface TieExtras {
  home?: string | null;
  memberships?: EmbeddableMembership[];
  ties?: string[];
  seat?: string | null;
  seatOf?: string[];
}

/** A row as the loader needs it: its id, plus the one record column its kind reads. */
export interface TieSubjectRow {
  id: string;
  /** npcs.location_id */
  location_id?: string | null;
  /** factions.seat_location_id */
  seat_location_id?: string | null;
}

export interface MembershipRecord {
  npc_id: string;
  faction_id: string;
  role: string | null;
}

export interface SeatRecord {
  faction_id: string;
  location_id: string;
}

const NAME_TABLES: Record<LinkKind, string> = {
  npc: "npcs",
  party_member: "party_members",
  faction: "factions",
  location: "locations",
  deity: "deities",
  item: "items",
};

/** Ids per `.in()` request: keeps the URL under the gateway's length cap. */
const ID_CHUNK = 200;
const PAGE_SIZE = 1000;

/** Pure: the extras for each subject row, from everything the loader fetched. */
export function assembleTieExtras(
  kind: TieSubjectKind,
  rows: readonly TieSubjectRow[],
  links: readonly TieLink[],
  names: ReadonlyMap<string, string>,
  memberships: readonly MembershipRecord[],
  seats: readonly SeatRecord[],
): Map<string, TieExtras> {
  const out = new Map<string, TieExtras>();
  // Index once: a row only needs the links that touch it.
  const linksBySubject = new Map<string, TieLink[]>();
  for (const link of links) {
    for (const [endKind, endId] of [[link.from_kind, link.from_id], [link.to_kind, link.to_id]] as const) {
      if (endKind !== kind) continue;
      const list = linksBySubject.get(endId) ?? [];
      list.push(link);
      linksBySubject.set(endId, list);
    }
  }
  for (const row of rows) {
    const extras: TieExtras = { ties: tieSentences(kind, row.id, linksBySubject.get(row.id) ?? [], names) };
    if (kind === "npc") {
      extras.home = row.location_id ? (names.get(tieNameKey("location", row.location_id)) ?? null) : null;
      extras.memberships = memberships
        .filter((m) => m.npc_id === row.id)
        .flatMap((m) => {
          const faction = names.get(tieNameKey("faction", m.faction_id));
          return faction ? [{ faction, role: m.role }] : [];
        });
    } else if (kind === "faction") {
      extras.seat = row.seat_location_id ? (names.get(tieNameKey("location", row.seat_location_id)) ?? null) : null;
    } else if (kind === "location") {
      extras.seatOf = seats
        .filter((s) => s.location_id === row.id)
        .flatMap((s) => {
          const faction = names.get(tieNameKey("faction", s.faction_id));
          return faction ? [faction] : [];
        });
    }
    out.set(row.id, extras);
  }
  return out;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface LinkRow {
  from_kind: LinkKind;
  from_id: string;
  to_kind: LinkKind;
  to_id: string;
  type: string;
}

/** Links with the subject at one end, paginated: a chunk of hub NPCs can exceed PostgREST's row cap. */
async function fetchLinksAt(
  client: SupabaseClient,
  end: "from" | "to",
  kind: TieSubjectKind,
  ids: readonly string[],
): Promise<LinkRow[]> {
  const rows: LinkRow[] = [];
  for (const chunk of chunks(ids, ID_CHUNK)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await client
        .from("world_links")
        .select("id, from_kind, from_id, to_kind, to_id, type")
        .eq(`${end}_kind`, kind)
        .in(`${end}_id`, chunk)
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Failed to read world_links: ${error.message}`);
      const page = (data ?? []) as unknown as LinkRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return rows;
}

async function fetchNames(client: SupabaseClient, wanted: ReadonlyMap<LinkKind, Set<string>>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const [kind, ids] of wanted) {
    for (const chunk of chunks([...ids], ID_CHUNK)) {
      const { data, error } = await client.from(NAME_TABLES[kind]).select("id, name").in("id", chunk);
      if (error) throw new Error(`Failed to read ${NAME_TABLES[kind]}: ${error.message}`);
      for (const row of (data ?? []) as unknown as { id: string; name: string | null }[]) {
        if (row.name) names.set(tieNameKey(kind, row.id), row.name);
      }
    }
  }
  return names;
}

/**
 * Extras for every row in `rows`, keyed by row id. Costs a fixed handful of
 * reads per chunk of 200 ids, however many rows there are. Kinds that carry
 * no ties (note, quest, library item) never call this.
 *
 * A membership counts only while it is Active: a retired, expelled or dead
 * member is not what a search for "who belongs to the Concord" should find.
 */
export async function loadTieExtras(
  client: SupabaseClient,
  kind: TieSubjectKind,
  rows: readonly TieSubjectRow[],
): Promise<Map<string, TieExtras>> {
  if (rows.length === 0) return new Map();
  const ids = rows.map((r) => r.id);

  const [fromHere, toHere] = await Promise.all([
    fetchLinksAt(client, "from", kind, ids),
    fetchLinksAt(client, "to", kind, ids),
  ]);
  const links: TieLink[] = [...fromHere, ...toHere];

  const memberships: MembershipRecord[] = [];
  if (kind === "npc") {
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const { data, error } = await client
        .from("faction_npcs")
        .select("npc_id, faction_id, role")
        .in("npc_id", chunk)
        .eq("status", "Active");
      if (error) throw new Error(`Failed to read faction_npcs: ${error.message}`);
      memberships.push(...((data ?? []) as unknown as MembershipRecord[]));
    }
  }

  const seats: SeatRecord[] = [];
  if (kind === "location") {
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const { data, error } = await client
        .from("factions")
        .select("id, seat_location_id")
        .in("seat_location_id", chunk);
      if (error) throw new Error(`Failed to read factions: ${error.message}`);
      for (const f of (data ?? []) as unknown as { id: string; seat_location_id: string }[]) {
        seats.push({ faction_id: f.id, location_id: f.seat_location_id });
      }
    }
  }

  // Every far end, plus the places and factions the records name.
  const wanted = new Map<LinkKind, Set<string>>();
  const want = (k: LinkKind, id: string | null | undefined) => {
    if (!id) return;
    const set = wanted.get(k) ?? new Set<string>();
    set.add(id);
    wanted.set(k, set);
  };
  for (const l of links) {
    // Both ends: in a same-kind link the far end may itself be another row of this chunk.
    want(l.from_kind, l.from_id);
    want(l.to_kind, l.to_id);
  }
  for (const r of rows) {
    if (kind === "npc") want("location", r.location_id);
    if (kind === "faction") want("location", r.seat_location_id);
  }
  for (const m of memberships) want("faction", m.faction_id);
  for (const s of seats) want("faction", s.faction_id);

  const names = await fetchNames(client, wanted);
  return assembleTieExtras(kind, rows, links, names, memberships, seats);
}
