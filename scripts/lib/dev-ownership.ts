/**
 * The pure halves of `dev-campaigns.ts`: what a production read may ask for,
 * and what must be dropped from what came back.
 *
 * ## The ownership rule
 *
 * A campaign has other people in it (players, their characters, their journals),
 * and this repo is public and the stack is a laptop. Only the maintainer's own
 * rows leave production. The rule is applied twice, and neither half trusts the
 * other:
 *
 *   1. `ownershipFilter` puts it in the GET itself, so a row that is someone
 *      else's is never transferred at all.
 *   2. `pruneForeignRows` removes what the first step leaves dangling. A row of
 *      the maintainer's can point at a row that was kept out (a DM note about a
 *      player's character); the import would fail on the foreign key, and
 *      "fixing" that by pulling the target would defeat step 1.
 *
 * The foreign keys come from the LOCAL schema's own metadata, so a column added
 * tomorrow is handled without touching this file.
 */
import { uuid } from "./dev-demo-sql.ts";

export type Rows = Record<string, unknown>[];

// Only these authored campaign tables treat an absent creator as source ownership.
// Threads record the acting DM, so a null creator there must not imply ownership.
const NULL_CREATOR_TABLES = new Set([
  "quest_beats",
  "quest_beat_edges",
  "quest_beat_attachments",
  "quest_clocks",
  "loot_placements",
]);

/**
 * Restricts rows to the source account in the PostgREST GET itself.
 * Both ownership columns must match when present. Null creators are accepted
 * only for the explicit campaign-authoring tables above; new tables default to
 * an exact match. Tables with neither column are scoped by their parent alone.
 */
export function ownershipFilter(table: string, columns: string[], source: string): string {
  const id = uuid(source);
  const parts: string[] = [];
  if (columns.includes("user_id")) parts.push(`user_id=eq.${id}`);
  if (columns.includes("created_by")) {
    parts.push(NULL_CREATOR_TABLES.has(table) ? `or=(created_by.eq.${id},created_by.is.null)` : `created_by=eq.${id}`);
  }
  return parts.join("&");
}

/** `a&b` with either side allowed to be empty. */
export function andFilters(...filters: string[]): string {
  return filters.filter((f) => f !== "").join("&");
}

/** One single-column foreign key of a pulled table. */
export interface FkRule {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  nullable: boolean;
  /**
   * `kept`: the target is a pulled table, so the value must be one of its kept
   * rows' `refColumn` values.
   * `allowed`: the target is not pulled (the accounts table, or campaign state
   * the copy leaves out). The value must be in `allowed`, which is empty for
   * state and the source account alone for accounts.
   */
  kind: "kept" | "allowed";
  allowed: ReadonlySet<string>;
}

export interface PruneReport {
  /** Rows dropped, per table. */
  pruned: Record<string, number>;
  /** Columns emptied instead because the row could stay, per `table.column`. */
  detached: Record<string, number>;
}

/**
 * Drops every row whose foreign key points at a row that is not in the set, and
 * repeats until nothing changes, because dropping a parent strands its
 * children. Mutates `tables` (arrays replaced in place).
 *
 * Only a required (NOT NULL) reference costs the row. A nullable one pointing
 * outside the set is emptied and the row kept: the row is the source account's
 * own, and an empty link carries nobody else's data. This matters more than it
 * looks. Pruning on a nullable link dropped 16 of a campaign's NPCs whose
 * `linked_monster_id` named monsters kept at account level, outside any
 * campaign (8 Oct 2026); the same rule empties a player's account id on a
 * character a player claimed, a play-session id the copy leaves out, and the
 * campaign's own `current_location_id`.
 */
export function pruneForeignRows(tables: Record<string, Rows>, rules: FkRule[]): PruneReport {
  const pruned: Record<string, number> = {};
  const detached: Record<string, number> = {};
  const bump = (into: Record<string, number>, key: string) => {
    into[key] = (into[key] ?? 0) + 1;
  };

  for (let changed = true; changed; ) {
    changed = false;
    const keys = new Map<string, Set<string>>();
    const keysOf = (table: string, column: string) => {
      const id = `${table}.${column}`;
      let set = keys.get(id);
      if (!set) {
        set = new Set((tables[table] ?? []).map((r) => r[column]).filter((v): v is string => typeof v === "string"));
        keys.set(id, set);
      }
      return set;
    };

    for (const rule of rules) {
      const rows = tables[rule.table];
      if (!rows || rows.length === 0) continue;
      const ok = rule.kind === "kept" ? keysOf(rule.refTable, rule.refColumn) : rule.allowed;
      const survivors: Rows = [];
      for (const row of rows) {
        const value = row[rule.column];
        if (value === null || value === undefined || (typeof value === "string" && ok.has(value))) {
          survivors.push(row);
          continue;
        }
        if (rule.nullable) {
          row[rule.column] = null;
          bump(detached, `${rule.table}.${rule.column}`);
          survivors.push(row);
        } else {
          bump(pruned, rule.table);
        }
        changed = true;
      }
      if (survivors.length !== rows.length) {
        tables[rule.table] = survivors;
        // A table that lost rows invalidates every cached key set built from it.
        for (const id of keys.keys()) if (id.startsWith(`${rule.table}.`)) keys.delete(id);
      }
    }
  }
  return { pruned, detached };
}

const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * The pulled campaign as the fixture's own: every pulled row and the campaign
 * get a fresh id, the source account becomes the fixture, and every reference
 * to any of them moves along, inside jsonb and arrays as much as in plain
 * columns. The same textual remap `private.remap_demo_ids` does for a demo copy,
 * and safe for the same reason: uuids are globally unique, so a replace can
 * only hit a reference to a row that was remapped. The account id is the one
 * exception, replaced only as a whole value (see below).
 *
 * Done here rather than through `private.copy_demo_template`, because that copy
 * is strict and real campaigns are not clean: a DM's quest beat may point at a
 * monster kept at account level, outside any campaign. Under the source account
 * that is valid; under the fixture it is not "available to this campaign", and
 * the copy aborts the whole campaign over it. Imported leniently instead, such
 * a row is skipped and reported, and the rest of the campaign lands.
 *
 * `newId` is injectable so a test can predict the output.
 */
export function remapToFixture(
  campaign: Record<string, unknown>,
  tables: { table: string; rows: Rows }[],
  source: string,
  fixture: string,
  newId: () => string = () => crypto.randomUUID(),
): { campaign: Record<string, unknown>; rows: Map<string, Rows> } {
  const author = uuid(source);
  const owner = uuid(fixture);
  const map = new Map<string, string>([[String(campaign.id), newId()]]);
  for (const t of tables) {
    for (const row of t.rows) {
      if (typeof row.id === "string" && !map.has(row.id)) map.set(row.id, newId());
    }
  }
  // Row ids are replaced wherever they appear: a mention inside rich text embeds
  // one mid-string. The account id only where it is a whole value, exactly as
  // `private.remap_demo_ids` does: storage paths embed the uploader's id
  // (`npc-portraits/<account>/<file>.webp`), and the files exist only under the
  // source account, so rewriting the path broke every image on the first run.
  const remap = <T>(value: T): T =>
    JSON.parse(
      JSON.stringify(value)
        .replaceAll(`"${author}"`, `"${owner}"`)
        .replace(UUID_TEXT, (found) => map.get(found) ?? found),
    ) as T;
  return {
    campaign: remap(campaign),
    rows: new Map(tables.map((t) => [t.table, remap(t.rows)])),
  };
}
