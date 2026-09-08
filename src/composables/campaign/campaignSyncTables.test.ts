import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SYNC_TABLES, SIGNAL_KEYS } from "./useCampaignLiveSync";

/**
 * The `campaign_sync` doorbell (migration 20260904230420) only rings for tables
 * that carry an AFTER DELETE trigger, and the client only acts on a signal it can
 * map to a query key. Those are three lists in three places, and a table added to
 * one of them is silent — not broken-looking — in the other two: the delete simply
 * never reaches the session, exactly the failure the doorbell was built to end.
 *
 * So they are asserted equal here rather than reviewed. This is the same
 * arrangement as `bucketRegistryMirror.test.ts`.
 */
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260904230420_campaign_sync_signal.sql",
);

/**
 * The table list inside the doorbell migration's `foreach t in array array[…]`
 * loop, plus every table a LATER migration wired to the same bell by hand —
 * `create trigger <table>_signal_delete … on public.<table>` — because a table
 * born after the doorbell (party_milestones, #850) cannot be added to a
 * historical migration and must not be invisible to this registry either.
 */
function triggeredTables(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const block = /foreach t in array array\[([\s\S]*?)\]/.exec(sql);
  if (!block) throw new Error("could not find the trigger table array in the migration");
  const looped = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const byHand = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && file > basename(MIGRATION))
    .flatMap((file) => [...readFileSync(resolve(MIGRATIONS_DIR, file), "utf8")
      .matchAll(/create trigger ([a-z_]+)_signal_delete\s+after delete on public\.\1\b/g)]
      .map((m) => m[1]));
  return [...new Set([...looped, ...byHand])].sort();
}

/**
 * Every `alter table X rename to Y` in the migration history, applied in
 * filename order, as historical name → current name.
 *
 * `ALTER TABLE ... RENAME` keeps a trigger attached by OID and `tg_table_name`
 * resolves live rather than at creation time, so the doorbell already signals
 * under the *current* name — verified against the local stack when #830 renamed
 * `quest_beat_loot` to `loot_placements`. But the migration this test reads is
 * historical SQL and is never edited after the fact (CLAUDE.md's migration
 * rules), so it will always name the table as it was.
 *
 * Derived rather than hand-listed on purpose. A map someone has to remember to
 * update after a rename is the same class of silent drift this whole test
 * exists to catch — it would fail loudly here, but only after the rename, and
 * the fix would be to append to a list that grows forever. Reading the renames
 * out of the history costs a few lines and never needs maintaining.
 */
function renameHistory(): Map<string, string> {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const current = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    for (const match of sql.matchAll(/alter\s+table\s+(?:public\.)?"?([a-z_]+)"?\s+rename\s+to\s+"?([a-z_]+)"?/gi)) {
      const from = match[1]!;
      const to = match[2]!;
      // Follow a chain: a table renamed twice keeps its original key, so a
      // lookup from the oldest name still lands on the newest.
      const original = [...current.entries()].find(([, name]) => name === from)?.[0] ?? from;
      current.set(original, to);
    }
  }
  return current;
}

const RENAMES = renameHistory();

/** The name this table had when the doorbell migration was written. */
function asTriggeredName(currentName: string): string {
  return [...RENAMES.entries()].find(([, name]) => name === currentName)?.[0] ?? currentName;
}

/** The name this table has now. */
function asCurrentName(triggeredName: string): string {
  return RENAMES.get(triggeredName) ?? triggeredName;
}

describe("campaign_sync doorbell registries", () => {
  it("puts a delete trigger on every live-synced table, plus party_inventory", () => {
    // party_inventory is not in SYNC_TABLES — it has exact-row handlers rather
    // than a registry entry — but its deletes are the ones players notice first.
    const expected = [...new Set([...SYNC_TABLES.map(([table]) => asTriggeredName(table)), "party_inventory"])].sort();
    expect(triggeredTables()).toEqual(expected);
  });

  it("can map every table that rings the doorbell to at least one query key", () => {
    for (const table of triggeredTables()) {
      const currentName = asCurrentName(table);
      expect(SIGNAL_KEYS.get(currentName), `${table} rings the doorbell but maps to no query key`)
        .toBeDefined();
    }
  });

  it("has no mapping for a table that can never ring it", () => {
    // store_items is the exception by construction: it has no campaign_id, so it
    // is on no channel and reaches the client *only* through the doorbell — via
    // its own three triggers rather than the loop.
    const canRing = new Set([...triggeredTables().map(asCurrentName), "store_items"]);
    for (const table of SIGNAL_KEYS.keys()) {
      expect(canRing.has(table), `${table} maps to a query key but nothing signals it`).toBe(true);
    }
  });

  it("refreshes the player-visible item projection for the two tables that widen it", () => {
    // A store row and an inventory row both carry only an item_id; the name comes
    // from get_player_visible_items. Refresh one without the other and the panel
    // lists "Unknown item" — the bug that started this (#811).
    expect(SIGNAL_KEYS.get("store_items")).toEqual(["store-items", "items"]);
    expect(SIGNAL_KEYS.get("party_inventory")).toEqual(["party-inventory", "items"]);
  });
});
