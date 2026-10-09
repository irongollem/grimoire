import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  SYNC_TABLES,
  SIGNAL_KEYS,
  QUEST_RUNTIME_SYNC_KEYS,
  BEATS_KEY,
  QUEST_RUNTIME_QUERY_KEYS,
  LISTENER_ONLY_SIGNALS,
  PLAYER_FACTIONS_KEY,
  PLAYER_NOTES_KEY,
  PLAYER_NPCS_KEY,
  THREADS_KEY,
} from "@/lib/campaignLiveSync/registry";

/**
 * Live sync is two lists in two places: the signals the database rings (over
 * Broadcast, one message per campaign per signal) and the query keys each one
 * refreshes (here). A table added to one of them is silent, not broken-looking,
 * in the other: a ring the client cannot map is ignored.
 *
 * supabase/tests/live_sync_registry.test.sql checks the database half against
 * the replayed schema. This file holds that test's lists equal to the client
 * registry, so neither side can grow alone. Same arrangement as
 * `bucketRegistryMirror.test.ts`.
 */
const REGISTRY_TEST = resolve(process.cwd(), "supabase/tests/live_sync_registry.test.sql");

function pgTapList(table: "live_sync_subscribed" | "live_sync_doorbell" | "live_sync_named_signal" | "live_sync_own_channel"): string[] {
  const sql = readFileSync(REGISTRY_TEST, "utf8");
  const block = new RegExp(`insert into ${table} \\([a-z_, ]+\\) values([\\s\\S]*?);`).exec(sql);
  if (!block) throw new Error(`could not find the ${table} list in live_sync_registry.test.sql`);
  // The first quoted value of each tuple is the name; a named signal's second
  // is its source table.
  return [...block[1].matchAll(/\('([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe("live sync registries", () => {
  it("checks every SYNC_TABLES table against the database", () => {
    // party_inventory is not in SYNC_TABLES (its root is not its name) but it
    // is in the database's first list and must ring too.
    const subscribed = [...new Set([...SYNC_TABLES.map(([table]) => table), "party_inventory"])].sort();
    expect(pgTapList("live_sync_subscribed")).toEqual(subscribed);
  });

  it("maps every table that can ring the doorbell, and nothing else", () => {
    const canRing = [...new Set([
      ...pgTapList("live_sync_subscribed"),
      ...pgTapList("live_sync_doorbell"),
      ...pgTapList("live_sync_named_signal"),
      ...pgTapList("live_sync_own_channel"),
    ])].sort();
    // Signals the client hears that the database test's lists do not name:
    // soundboard_broadcast and campaigns are heard by listeners, and the
    // encounter runner's table maps to the session log.
    const heard = new Set([...canRing, "encounter_state"]);
    expect([...SIGNAL_KEYS.keys()].filter((signal) => !heard.has(signal))).toEqual([]);
    expect(canRing.filter((signal) => !SIGNAL_KEYS.has(signal) && !LISTENER_ONLY_SIGNALS.has(signal))).toEqual([]);
  });

  it("maps every signal the database can ring to at least one query key or a listener", () => {
    const rung = [
      "calendar_events", "campaign_enabled_sources", "campaign_invites", "campaign_members", "campaign_messages",
      "campaign_rules", "campaign_sessions", "campaign_tile_packs", "character_content_reviews", "character_memorials",
      "class_features", "class_option_texts", "companions", "crafting_recipes", "custom_classes", "custom_subclasses",
      "deities", "discovered_monsters", "dm_note_touches", "downtime_deck_backs", "downtime_draws", "downtime_grants",
      "downtime_outcomes", "dungeon_features", "dungeon_maps", "encounter_state", "encounters", "entity_mentions",
      "entity_notes", "faction_deities", "factions", "factions_player", "handout_reveals", "item_entries", "items",
      "location_reveals", "locations", "locations_player", "loot_placements", "loot_tables", "memorial_mourners",
      "minis", "monsters", "notes", "notes_player", "npc_favors", "npc_inventory", "npc_pc_notes", "npc_relationships",
      "npc_reveals", "npc_sets", "npcs", "npcs_player", "pantheons", "party_inventory", "party_member_tracker_state",
      "party_members", "party_milestones", "pinned_forms", "player_favourites", "player_journal_entries",
      "player_npc_ratings", "puzzle_rooms", "quest_beat_attachments", "quest_beat_edge_gates", "quest_beat_edges",
      "quest_beat_transitions", "quest_beats_player", "quest_clocks", "quest_consequence_events", "quest_runtime_state",
      "quest_threads", "quests", "quests_player", "roll_tables", "rules", "session_availability", "session_proposals",
      "soundboard_broadcast", "soundboard_pages", "soundboard_playlists", "sounds", "species", "spells", "traps",
      "campaigns",
    ];
    const silent = rung.filter(
      (signal) => !(SIGNAL_KEYS.get(signal)?.length) && !LISTENER_ONLY_SIGNALS.has(signal),
    );
    expect(silent).toEqual([]);
  });

  it("refreshes the DM's and the players' notes from either notes signal", () => {
    for (const signal of ["notes", "notes_player"]) {
      expect(SIGNAL_KEYS.get(signal), signal).toEqual(expect.arrayContaining(["notes", PLAYER_NOTES_KEY]));
    }
  });

  it("refreshes an open character sheet when another client changes it", () => {
    // #1026: a DM's level, subclass or terrain edit, or the spells a subclass
    // regrants server-side, must reach the player's sheet, and the reverse.
    expect(SIGNAL_KEYS.get("character_classes")).toContain("character_classes");
    expect(SIGNAL_KEYS.get("character_spells")).toEqual(
      expect.arrayContaining(["characterSpells", "characterSpellsDetails"]),
    );
    // A deleted or departed character leaves every member's party lists.
    expect(SIGNAL_KEYS.get("party_members")).toEqual(["party", "my-characters", "offered-characters"]);
  });

  it("tells players to re-read the running session and the session labels", () => {
    expect([...(SIGNAL_KEYS.get("campaign_sessions") ?? [])].sort()).toEqual(["player-session-state", "player-sessions"]);
    expect(SIGNAL_KEYS.has("campaign_session_state")).toBe(false);
  });

  it("refreshes every quest runtime view from any of the runtime tables", () => {
    // One transition writes all three tables and the run context joins them, so
    // any one ringing must reach every view: the job four 5s polls did before.
    // Plus the player's beat projection: a reveal is a visit, not a beat edit.
    const expected = [...QUEST_RUNTIME_SYNC_KEYS].sort();
    expect(expected).toEqual([...QUEST_RUNTIME_QUERY_KEYS, THREADS_KEY, BEATS_KEY].sort());
    for (const table of ["quest_runtime_state", "quest_threads"]) {
      expect([...(SIGNAL_KEYS.get(table) ?? [])].sort(), table).toEqual(expected);
    }
    // A step is also a learned moment filed under a session (#985), so the
    // transition log refreshes that list as well.
    expect([...(SIGNAL_KEYS.get("quest_beat_transitions") ?? [])].sort()).toEqual([...expected, "session-learned"].sort());
  });

  it("refreshes the player-visible item projection for the two tables that widen it", () => {
    // A store row and an inventory row both carry only an item_id; the name comes
    // from get_player_visible_items. Refresh one without the other and the panel
    // lists "Unknown item" — the bug that started this (#811).
    expect(SIGNAL_KEYS.get("store_items")).toEqual(["store-items", "items"]);
    expect(SIGNAL_KEYS.get("party_inventory")).toEqual(["party-inventory", "items"]);
  });

  it("tells players to re-read the projections that replaced their notes and factions reads", () => {
    // Players cannot select either table (secret blocks, #932); the ring is
    // the only thing that reaches them.
    expect(SIGNAL_KEYS.get("notes_player")).toContain(PLAYER_NOTES_KEY);
    expect(SIGNAL_KEYS.get("factions_player")).toContain(PLAYER_FACTIONS_KEY);
  });

  it("refreshes the projection roots for the projection signals", () => {
    expect(SIGNAL_KEYS.get("locations_player")).toEqual(["locations", PLAYER_NPCS_KEY]);
    expect(SIGNAL_KEYS.get("quests_player")).toEqual(["quests"]);
    expect(SIGNAL_KEYS.get("quest_beats_player")).toEqual([BEATS_KEY]);
    expect(SIGNAL_KEYS.get("quest_objectives_player")).toEqual(["quest_objectives"]);
  });
});
