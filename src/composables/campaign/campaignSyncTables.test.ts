import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { SYNC_TABLES, SIGNAL_KEYS, QUEST_RUNTIME_SYNC_KEYS } from "./useCampaignLiveSync";
import { BEATS_KEY, QUEST_RUNTIME_QUERY_KEYS } from "@/composables/quests/useQuestFlow";
import { THREADS_KEY } from "@/composables/quests/useQuestThreads";

/**
 * Live sync is three lists in two places: the tables the channel subscribes to
 * and the tables that ring the `campaign_sync` doorbell (in the database), and
 * the query keys each table refreshes (here). A table added to one of them is
 * silent, not broken-looking, in the others: a subscription to an unpublished
 * table joins and receives nothing, and a doorbell naming a table the client
 * cannot map is ignored.
 *
 * supabase/tests/live_sync_registry.test.sql checks the database half against
 * the replayed schema: published, filterable, triggered. This file holds that
 * test's lists equal to the client registry, so neither side can grow alone.
 * Same arrangement as `bucketRegistryMirror.test.ts`.
 */
const REGISTRY_TEST = resolve(process.cwd(), "supabase/tests/live_sync_registry.test.sql");

function pgTapList(table: "live_sync_subscribed" | "live_sync_doorbell" | "live_sync_named_signal"): string[] {
  const sql = readFileSync(REGISTRY_TEST, "utf8");
  const block = new RegExp(`insert into ${table} \\([a-z_, ]+\\) values([\\s\\S]*?);`).exec(sql);
  if (!block) throw new Error(`could not find the ${table} list in live_sync_registry.test.sql`);
  // The first quoted value of each tuple is the name; a named signal's second
  // is its source table.
  return [...block[1].matchAll(/\('([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe("live sync registries", () => {
  it("checks every subscribed table against the database", () => {
    // party_inventory is not in SYNC_TABLES (it has exact-row handlers rather
    // than a registry entry) but it is subscribed and must be published too.
    const subscribed = [...new Set([...SYNC_TABLES.map(([table]) => table), "party_inventory"])].sort();
    expect(pgTapList("live_sync_subscribed")).toEqual(subscribed);
  });

  it("maps every table that can ring the doorbell, and nothing else", () => {
    const canRing = [...new Set([
      ...pgTapList("live_sync_subscribed"),
      ...pgTapList("live_sync_doorbell"),
      ...pgTapList("live_sync_named_signal"),
    ])].sort();
    expect([...SIGNAL_KEYS.keys()].sort()).toEqual(canRing);
  });

  it("refreshes every quest runtime view from any of the runtime tables", () => {
    // One transition writes all three tables and the run context joins them, so
    // any one ringing must reach every view: the job four 5s polls did before.
    // Plus the player's beat projection: a reveal is a visit, not a beat edit.
    const expected = [...QUEST_RUNTIME_SYNC_KEYS].sort();
    expect(expected).toEqual([...QUEST_RUNTIME_QUERY_KEYS, THREADS_KEY, BEATS_KEY].sort());
    for (const table of ["quest_runtime_state", "quest_threads", "quest_beat_transitions"]) {
      expect([...(SIGNAL_KEYS.get(table) ?? [])].sort(), table).toEqual(expected);
    }
  });

  it("refreshes the player-visible item projection for the two tables that widen it", () => {
    // A store row and an inventory row both carry only an item_id; the name comes
    // from get_player_visible_items. Refresh one without the other and the panel
    // lists "Unknown item" — the bug that started this (#811).
    expect(SIGNAL_KEYS.get("store_items")).toEqual(["store-items", "items"]);
    expect(SIGNAL_KEYS.get("party_inventory")).toEqual(["party-inventory", "items"]);
  });

  it("refreshes only player roots for the player-only signals", () => {
    expect(SIGNAL_KEYS.get("locations_player")).toEqual(["locations"]);
    expect(SIGNAL_KEYS.get("quests_player")).toEqual(["quests"]);
    expect(SIGNAL_KEYS.get("quest_beats_player")).toEqual([BEATS_KEY]);
    expect(SIGNAL_KEYS.get("quest_objectives_player")).toEqual(["quest_objectives"]);
  });
});
