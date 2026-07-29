import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { applyCampaignRealtimeWorld } from "@/lib/campaignRealtimeWorld";

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

  it("moves quests between status and subquest lists while invalidating, not replacing, player projections", () => {
    const qc = new QueryClient();
    const previous = row({ id: "quest-1", status: "rumor", parent_quest_id: "parent-a", notes: "secret" });
    const next = row({ ...previous, status: "active", parent_quest_id: "parent-b", notes: "still secret" });
    const playerProjection = [{ id: "quest-1", title: "Public", notes: null }];
    qc.setQueryData(["quests", "campaign-1", "rumor"], [previous]);
    qc.setQueryData(["quests", "campaign-1", "active"], []);
    qc.setQueryData(["quests", "sub", "parent-a"], [previous]);
    qc.setQueryData(["quests", "sub", "parent-b"], []);
    qc.setQueryData(["quests", "campaign-1", "player-visible"], playerProjection);
    qc.setQueryData(["quests", "player-one", "quest-1"], playerProjection[0]);
    qc.setQueryData(["encounter_quests", "encounter-1"], [{ id: "quest-1", title: "Old" }]);

    expect(applyCampaignRealtimeWorld(qc, "quests", { eventType: "UPDATE", old: previous, new: next }, dm)).toBe(true);
    expect(qc.getQueryData(["quests", "campaign-1", "rumor"])).toEqual([]);
    expect(qc.getQueryData(["quests", "campaign-1", "active"])).toEqual([next]);
    expect(qc.getQueryData(["quests", "sub", "parent-a"])).toEqual([]);
    expect(qc.getQueryData(["quests", "sub", "parent-b"])).toEqual([next]);
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
    expect(qc.getQueryData(["locations", "campaign-1", "continent-1"])).toEqual([next]);
    expect(qc.getQueryData(["locations", "location-1"])).toEqual(next);
    expect(qc.getQueryData(["locations", "campaign-1", "shared", false])).toBe(shared);
    expect(invalidated(qc, ["locations", "campaign-1", "shared", false])).toBe(true);
    expect(invalidated(qc, ["locations", "player-one", "location-1", false])).toBe(true);
    expect(invalidated(qc, ["faction-locations", "faction-1"])).toBe(true);
  });

  it("patches raw NPC location filters but never places a raw NPC in player projections", () => {
    const qc = new QueryClient();
    const npc = row({ id: "npc-1", location_id: "inn-1", notes: "DM secret" });
    const shared = [{ id: "npc-1", name: "???", notes: null }];
    qc.setQueryData(["npcs", "campaign-1"], []);
    qc.setQueryData(["npcs", "by-location", "inn-1"], []);
    qc.setQueryData(["npcs", "by-locations", ["inn-1", "market-1"]], []);
    qc.setQueryData(["npcs", "shared", "campaign-1", null], shared);
    qc.setQueryData(["npcs", "shared-by-locations", ["inn-1"], null], shared);
    qc.setQueryData(["npcs", "spell-casters", "campaign-1", "spell-1"], [{ npc_id: "old", name: "Old" }]);
    qc.setQueryData(["global-search", "alp", "campaign-1"], []);
    qc.setQueryData(["faction-npcs", "faction-1"], [{ npc: { id: "npc-1", name: "Old" } }]);

    applyCampaignRealtimeWorld(qc, "npcs", change(npc), dm);
    expect(qc.getQueryData(["npcs", "campaign-1"])).toEqual([npc]);
    expect(qc.getQueryData(["npcs", "by-location", "inn-1"])).toEqual([npc]);
    expect(qc.getQueryData(["npcs", "by-locations", ["inn-1", "market-1"]])).toEqual([npc]);
    expect(qc.getQueryData(["npcs", "shared", "campaign-1", null])).toBe(shared);
    expect(qc.getQueryData(["npcs", "shared-by-locations", ["inn-1"], null])).toBe(shared);
    expect(invalidated(qc, ["npcs", "shared", "campaign-1", null])).toBe(true);
    expect(invalidated(qc, ["npcs", "shared-by-locations", ["inn-1"], null])).toBe(true);
    expect(invalidated(qc, ["npcs", "spell-casters", "campaign-1", "spell-1"])).toBe(true);
    expect(invalidated(qc, ["global-search", "alp", "campaign-1"])).toBe(true);
    expect(invalidated(qc, ["faction-npcs", "faction-1"])).toBe(true);
  });

  it("uses targeted invalidation for faction player projections and faction joins", () => {
    const qc = new QueryClient();
    const faction = row({ id: "faction-1", name: "Zhentarim", description: "secret" });
    const projection = [{ id: "faction-1", name: "Public" }];
    qc.setQueryData(["factions", "campaign-1"], []);
    qc.setQueryData(["factions", "campaign-1", "player-visible"], projection);
    qc.setQueryData(["npc-factions", "npc-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["deity-factions", "deity-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["party-member-factions", "member-1"], [{ faction: { id: "faction-1", name: "Old" } }]);
    qc.setQueryData(["faction-relations", "faction-2"], { outgoing: [], incoming: [] });

    applyCampaignRealtimeWorld(qc, "factions", change(faction), dm);
    expect(qc.getQueryData(["factions", "campaign-1"])).toEqual([faction]);
    expect(qc.getQueryData(["factions", "campaign-1", "player-visible"])).toBe(projection);
    expect(invalidated(qc, ["factions", "campaign-1", "player-visible"])).toBe(true);
    expect(invalidated(qc, ["npc-factions", "npc-1"])).toBe(true);
    expect(invalidated(qc, ["deity-factions", "deity-1"])).toBe(true);
    expect(invalidated(qc, ["party-member-factions", "member-1"])).toBe(true);
    expect(invalidated(qc, ["faction-relations", "faction-2"])).toBe(true);
  });

  it("applies a complete RLS-authorized companion row for a player and reports unsupported tables", () => {
    const qc = new QueryClient();
    const companion = row({ id: "companion-1", sort_order: 2, notes: "DM secret" });
    const visible = [{ id: "companion-1", name: "Public", notes: null }];
    qc.setQueryData(["companions", "campaign-1"], visible);

    expect(applyCampaignRealtimeWorld(qc, "companions", change(companion), player)).toBe(true);
    expect(qc.getQueryData(["companions", "campaign-1"])).toEqual([companion]);
    expect(invalidated(qc, ["companions", "campaign-1"])).toBe(false);
    expect(applyCampaignRealtimeWorld(qc, "calendar_events", change(companion), dm)).toBe(false);
  });
});
