import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260904230420_campaign_sync_signal.sql",
);

/** The table list inside the migration's `foreach t in array array[…]` loop. */
function triggeredTables(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const block = /foreach t in array array\[([\s\S]*?)\]/.exec(sql);
  if (!block) throw new Error("could not find the trigger table array in the migration");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe("campaign_sync doorbell registries", () => {
  it("puts a delete trigger on every live-synced table, plus party_inventory", () => {
    // party_inventory is not in SYNC_TABLES — it has exact-row handlers rather
    // than a registry entry — but its deletes are the ones players notice first.
    const expected = [...new Set([...SYNC_TABLES.map(([table]) => table), "party_inventory"])].sort();
    expect(triggeredTables()).toEqual(expected);
  });

  it("can map every table that rings the doorbell to at least one query key", () => {
    for (const table of triggeredTables()) {
      expect(SIGNAL_KEYS.get(table), `${table} rings the doorbell but maps to no query key`)
        .toBeDefined();
    }
  });

  it("has no mapping for a table that can never ring it", () => {
    // store_items is the exception by construction: it has no campaign_id, so it
    // is on no channel and reaches the client *only* through the doorbell — via
    // its own three triggers rather than the loop.
    const canRing = new Set([...triggeredTables(), "store_items"]);
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
