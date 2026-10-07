import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { applyCampaignRealtimeWorld } from "@/lib/campaignLiveSync/campaignRealtimeWorld";

type Row = Record<string, unknown> & { id: string; campaign_id: string };

const dm = { campaignId: "campaign-1", isDM: true };
const player = { campaignId: "campaign-1", isDM: false };

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    campaign_id: "campaign-1",
    name: "Alpha",
    title: "Alpha",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function change(newRow: Row, old: Partial<Row> = {}): { eventType: "INSERT"; new: Row; old: Partial<Row> } {
  return { eventType: "INSERT", new: newRow, old };
}

function invalidated(qc: QueryClient, key: readonly unknown[]): boolean {
  return qc.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false;
}

describe("applyCampaignRealtimeWorld", () => {
  it("refetches the narrow note reads on any note change and leaves other campaigns alone", () => {
    const qc = new QueryClient();
    const keys = [
      ["notes", "campaign-1", "pinned", 4],
      ["notes", "campaign-1", "session-links"],
      ["notes", "campaign-1", "session-recap", "s1"],
      ["notes", "campaign-2", "pinned", 4],
    ];
    for (const key of keys) qc.setQueryData(key, []);

    expect(applyCampaignRealtimeWorld(qc, "notes", change(row({ id: "n1" })), dm)).toBe(true);
    expect(invalidated(qc, keys[0])).toBe(true);
    expect(invalidated(qc, keys[1])).toBe(true);
    expect(invalidated(qc, keys[2])).toBe(true);
    expect(invalidated(qc, keys[3])).toBe(false);
  });

  it("patches exact note list and detail caches in their fetch order", () => {
    const qc = new QueryClient();
    const older = row({ id: "older", updated_at: "2026-01-01T00:00:00.000Z" });
    const newer = row({ id: "newer", updated_at: "2026-02-01T00:00:00.000Z" });
    qc.setQueryData(["notes", "campaign-1"], [older]);
    qc.setQueryData(["notes", "newer"], newer);

    expect(applyCampaignRealtimeWorld(qc, "notes", change(newer), dm)).toBe(true);
    expect(qc.getQueryData(["notes", "campaign-1"])).toEqual([newer, older]);
    expect(qc.getQueryData(["notes", "newer"])).toEqual(newer);
  });

  it("refreshes, never splices into, the player note projection a previewing DM holds", () => {
    const qc = new QueryClient();
    const note = row({ id: "n1", content: "secret" });
    const projection = [{ id: "n1", content: "public" }];
    qc.setQueryData(["player-notes", "campaign-1", null], projection);

    applyCampaignRealtimeWorld(qc, "notes", change(note), dm);
    expect(qc.getQueryData(["player-notes", "campaign-1", null])).toBe(projection);
    expect(invalidated(qc, ["player-notes", "campaign-1", null])).toBe(true);
  });

  it("updates the campaign quest list in place while invalidating, not replacing, player projections", () => {
    const qc = new QueryClient();
    const previous = row({ id: "quest-1", status: "undiscovered", parent_quest_id: "parent-a", notes: "secret" });
    const next = row({ ...previous, status: "active", parent_quest_id: "parent-b", notes: "still secret" });
    const playerProjection = [{ id: "quest-1", title: "Public", notes: null }];
    qc.setQueryData(["quests", "campaign-1", "all"], [previous]);
    qc.setQueryData(["quests", "campaign-1", "player-visible"], playerProjection);
    qc.setQueryData(["quests", "player-one", "quest-1"], playerProjection[0]);
    qc.setQueryData(["encounter_quests", "encounter-1"], [{ id: "quest-1", title: "Old" }]);

    expect(applyCampaignRealtimeWorld(qc, "quests", { eventType: "UPDATE", old: previous, new: next }, dm)).toBe(true);
    // The one campaign list holds every status, so a status change replaces the
    // row in place rather than moving it between lists.
    expect(qc.getQueryData(["quests", "campaign-1", "all"])).toEqual([next]);
    expect(qc.getQueryData(["quests", "campaign-1", "player-visible"])).toBe(playerProjection);
    expect(qc.getQueryData(["quests", "player-one", "quest-1"])).toBe(playerProjection[0]);
    expect(invalidated(qc, ["quests", "campaign-1", "player-visible"])).toBe(true);
    expect(invalidated(qc, ["quests", "player-one", "quest-1"])).toBe(true);
    expect(invalidated(qc, ["encounter_quests", "encounter-1"])).toBe(true);
  });

  it("moves locations between parent lists and invalidates their shared projection and joins", () => {
    const qc = new QueryClient();
    const previous = row({ id: "location-1", parent_id: null, notes: "secret map pin" });
    const next = row({ ...previous, parent_id: "continent-1", name: "Zulu" });
    const shared = [{ id: "location-1", name: "Public", notes: null }];
    qc.setQueryData(["locations", "campaign-1", null], [previous]);
    qc.setQueryData(["locations", "campaign-1", "continent-1"], []);
    qc.setQueryData(["locations", "location-1"], previous);
    qc.setQueryData(["locations", "campaign-1", "shared", false], shared);
    qc.setQueryData(["locations", "player-one", "location-1", false], shared[0]);
    qc.setQueryData(["faction-locations", "faction-1"], [{ location: { id: "location-1", name: "Old" } }]);

    applyCampaignRealtimeWorld(qc, "locations", { eventType: "UPDATE", old: previous, new: next }, dm);
    expect(qc.getQueryData(["locations", "campaign-1", null])).toEqual([]);
    // "continent-1" held no prior copy of this location, so the UPDATE
    // invalidates it instead of inserting a payload that may have omitted an
    // unchanged TOASTed column (e.g. `notes`).
    expect(qc.getQueryData(["locations", "campaign-1", "continent-1"])).toEqual([]);
    expect(invalidated(qc, ["locations", "campaign-1", "continent-1"])).toBe(true);
    expect(qc.getQueryData(["locations", "location-1"])).toEqual(next);
    expect(qc.getQueryData(["locations", "campaign-1", "shared", false])).toBe(shared);
    expect(invalidated(qc, ["locations", "campaign-1", "shared", false])).toBe(true);
    expect(invalidated(qc, ["locations", "player-one", "location-1", false])).toBe(true);
    expect(invalidated(qc, ["faction-locations", "faction-1"])).toBe(true);
  });

  it("keeps the campaign-wide place list slim: a spliced row carries summary columns only", () => {
    const qc = new QueryClient();
    const cached = row({ id: "location-1", parent_id: null, name: "Alpha", location_type: "city", sort_order: null });
    qc.setQueryData(["locations", "campaign-1", "all"], [cached]);
    qc.setQueryData(["locations", "campaign-1", null], [row({ id: "location-1", notes: "n" })]);

    // An UPDATE payload that omits an unchanged column must not blank it.
    const update = { id: "location-1", campaign_id: "campaign-1", name: "Beta", description: "long", notes: "secret" };
    applyCampaignRealtimeWorld(qc, "locations", { eventType: "UPDATE", old: cached, new: update }, dm);
    const [updated] = qc.getQueryData<Row[]>(["locations", "campaign-1", "all"]) ?? [];
    expect(updated).toMatchObject({ id: "location-1", name: "Beta", location_type: "city" });
    expect(updated).not.toHaveProperty("description");
    expect(updated).not.toHaveProperty("notes");

    // An INSERT lands slim in the "all" list and full in a parent-filtered one.
    const inserted = row({ id: "location-2", parent_id: null, location_type: "town", description: "d", notes: "n" });
    applyCampaignRealtimeWorld(qc, "locations", { eventType: "INSERT", old: {}, new: inserted }, dm);
    const all = qc.getQueryData<Row[]>(["locations", "campaign-1", "all"]) ?? [];
    expect(all.find((r) => r.id === "location-2")).not.toHaveProperty("notes");
    const byParent = qc.getQueryData<Row[]>(["locations", "campaign-1", null]) ?? [];
    expect(byParent.find((r) => r.id === "location-2")).toHaveProperty("notes", "n");
  });

  it("patches raw NPC location filters but never places a raw NPC in player projections", () => {
    const qc = new QueryClient();
    const npc = row({ id: "npc-1", location_id: "inn-1", notes: "DM secret" });
    const shared = [{ id: "npc-1", name: "???", notes: null }];
    qc.setQueryData(["npcs", "campaign-1"], []);
    qc.setQueryData(["npcs", "by-location", "inn-1"], []);
    qc.setQueryData(["npcs", "by-locations", ["inn-1", "market-1"]], []);
    qc.setQueryData(["player-npcs", "campaign-1", null], shared);
    qc.setQueryData(["player-npcs", "by-locations", ["inn-1"], null], shared);
    qc.setQueryData(["npcs", "spell-casters", "campaign-1", "spell-1"], [{ npc_id: "old", name: "Old" }]);
    qc.setQueryData(["global-search", "alp", "campaign-1"], []);
    qc.setQueryData(["faction-npcs", "faction-1"], [{ npc: { id: "npc-1", name: "Old" } }]);

    applyCampaignRealtimeWorld(qc, "npcs", change(npc), dm);
    // The campaign list is slim (#999: no prose), so the DM-only notes never land in it.
    expect(qc.getQueryData(["npcs", "campaign-1"])).toEqual([
      { id: "npc-1", campaign_id: "campaign-1", name: "Alpha", location_id: "inn-1", updated_at: npc.updated_at },
    ]);
    expect(qc.getQueryData(["npcs", "by-location", "inn-1"])).toEqual([npc]);
    expect(qc.getQueryData(["npcs", "by-locations", ["inn-1", "market-1"]])).toEqual([npc]);
    expect(qc.getQueryData(["player-npcs", "campaign-1", null])).toBe(shared);
    expect(qc.getQueryData(["player-npcs", "by-locations", ["inn-1"], null])).toBe(shared);
    expect(invalidated(qc, ["player-npcs", "campaign-1", null])).toBe(true);
    expect(invalidated(qc, ["player-npcs", "by-locations", ["inn-1"], null])).toBe(true);
    expect(invalidated(qc, ["npcs", "spell-casters", "campaign-1", "spell-1"])).toBe(true);
    expect(invalidated(qc, ["global-search", "alp", "campaign-1"])).toBe(true);
    expect(invalidated(qc, ["faction-npcs", "faction-1"])).toBe(true);
  });

  it("keeps the NPC detail cache whole and rings the head count and appearance reads (#999)", () => {
    const qc = new QueryClient();
    const full = row({ id: "npc-1", name: "Alpha", notes: "DM secret", backstory: "long" });
    qc.setQueryData(["npcs", "npc-1"], full);
    qc.setQueryData(["npcs", "count", "campaign-1"], 3);
    qc.setQueryData(["npcs", "appearances", ["npc-1"]], new Map());
    qc.setQueryData(["npcs", "names", ["npc-1"]], new Map());

    applyCampaignRealtimeWorld(qc, "npcs", { eventType: "UPDATE", old: {}, new: { ...full, name: "Beta" } }, dm);
    expect(qc.getQueryData(["npcs", "npc-1"])).toEqual({ ...full, name: "Beta" });
    // An update changes no count, but it can change an appearance.
    expect(invalidated(qc, ["npcs", "count", "campaign-1"])).toBe(false);
    expect(invalidated(qc, ["npcs", "appearances", ["npc-1"]])).toBe(true);
    expect(invalidated(qc, ["npcs", "names", ["npc-1"]])).toBe(true);

    applyCampaignRealtimeWorld(qc, "npcs", { eventType: "INSERT", old: {}, new: row({ id: "npc-2", campaign_id: "campaign-1" }) }, dm);
    expect(invalidated(qc, ["npcs", "count", "campaign-1"])).toBe(true);
  });

  it("uses targeted invalidation for faction player projections and faction joins", () => {
    const qc = new QueryClient();
    const faction = row({ id: "faction-1", name: "Zhentarim", description: "secret" });
    const projection = [{ id: "faction-1", name: "Public" }];
    qc.setQueryData(["factions", "campaign-1"], []);
    qc.setQueryData(["player-factions", "campaign-1", null], projection);
    qc.setQueryData(["npc-factions", "npc-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["deity-factions", "deity-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["party-member-factions", "member-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["faction-relations", "faction-2"], { outgoing: [], incoming: [] });

    applyCampaignRealtimeWorld(qc, "factions", change(faction), dm);
    expect(qc.getQueryData(["factions", "campaign-1"])).toEqual([faction]);
    expect(qc.getQueryData(["player-factions", "campaign-1", null])).toBe(projection);
    expect(invalidated(qc, ["player-factions", "campaign-1", null])).toBe(true);
    expect(invalidated(qc, ["npc-factions", "npc-1"])).toBe(true);
    expect(invalidated(qc, ["deity-factions", "deity-1"])).toBe(true);
    expect(invalidated(qc, ["party-member-factions", "member-1"])).toBe(true);
    expect(invalidated(qc, ["faction-relations", "faction-2"])).toBe(true);
  });

  it("applies a complete RLS-authorized companion row for a player and reports unsupported tables", () => {
    const qc = new QueryClient();
    const companion = row({ id: "companion-1", sort_order: 2, current_hp: 3 });
    const visible = [{ id: "companion-1", name: "Public", current_hp: 7 }];
    qc.setQueryData(["companions", "campaign-1"], visible);

    expect(applyCampaignRealtimeWorld(qc, "companions", change(companion), player)).toBe(true);
    expect(qc.getQueryData(["companions", "campaign-1"])).toEqual([companion]);
    expect(invalidated(qc, ["companions", "campaign-1"])).toBe(false);
    expect(applyCampaignRealtimeWorld(qc, "calendar_events", change(companion), dm)).toBe(false);
  });

  it("refetches the DM's npc-reveals reads on npc and location rows, and leaves players alone", () => {
    for (const table of ["npcs", "locations"]) {
      const dmClient = new QueryClient();
      dmClient.setQueryData(["npc-reveals", "npc-1"], new Map());
      applyCampaignRealtimeWorld(dmClient, table, change(row()), dm);
      expect(invalidated(dmClient, ["npc-reveals", "npc-1"])).toBe(true);

      const playerClient = new QueryClient();
      playerClient.setQueryData(["npc-reveals", "npc-1"], new Map());
      applyCampaignRealtimeWorld(playerClient, table, change(row()), player);
      expect(invalidated(playerClient, ["npc-reveals", "npc-1"])).toBe(false);
    }
  });

  it("refetches the DM's per-session learned lists on npc and location rows, and leaves players alone", () => {
    for (const table of ["npcs", "locations"]) {
      const dmClient = new QueryClient();
      dmClient.setQueryData(["session-learned", "campaign-1", "session-1"], {});
      applyCampaignRealtimeWorld(dmClient, table, change(row()), dm);
      expect(invalidated(dmClient, ["session-learned", "campaign-1", "session-1"])).toBe(true);

      const playerClient = new QueryClient();
      playerClient.setQueryData(["session-learned", "campaign-1", "session-1"], {});
      applyCampaignRealtimeWorld(playerClient, table, change(row()), player);
      expect(invalidated(playerClient, ["session-learned", "campaign-1", "session-1"])).toBe(false);
    }
  });
});
