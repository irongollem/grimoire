import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { dispatchCampaignRealtimePlayer } from "@/lib/campaignRealtimePlayer";

const dm = { campaignId: "campaign", currentUserId: "dm", isDM: true };
const player = { campaignId: "campaign", currentUserId: "player", isDM: false };

describe("dispatchCampaignRealtimePlayer", () => {
  it("updates only the DM's raw discoveries and invalidates player monster projections", () => {
    const qc = new QueryClient();
    const row = { id: "discovery", campaign_id: "campaign", discovered_at: "2026-01-01", monster_id: "monster" };
    qc.setQueryData(["discovered-monsters", "campaign"], []);
    qc.setQueryData(["discovered-monsters", "player", "campaign"], []);
    qc.setQueryData(["monsters", "player-visible", "campaign"], []);

    expect(dispatchCampaignRealtimePlayer(qc, dm, "discovered_monsters", { eventType: "INSERT", old: {}, new: row })).toBe(true);
    expect(qc.getQueryData(["discovered-monsters", "campaign"])).toEqual([row]);
    expect(qc.getQueryData(["discovered-monsters", "player", "campaign"])).toEqual([]);
    expect(qc.getQueryCache().find({ queryKey: ["monsters", "player-visible", "campaign"], exact: true })?.state.isInvalidated).toBe(true);
  });

  it("never writes a raw puzzle row into the player secret-stripping projection", () => {
    const qc = new QueryClient();
    const projection = [{ id: "puzzle", name: "A clue", solution: null }];
    qc.setQueryData(["puzzle_rooms", "player", "campaign"], projection);

    dispatchCampaignRealtimePlayer(qc, player, "puzzle_rooms", {
      eventType: "UPDATE",
      old: { id: "puzzle" },
      new: { id: "puzzle", campaign_id: "campaign", name: "A clue", solution: "secret" },
    });

    expect(qc.getQueryData(["puzzle_rooms", "player", "campaign"])).toEqual(projection);
    expect(qc.getQueryCache().find({ queryKey: ["puzzle_rooms", "player", "campaign"], exact: true })?.state.isInvalidated).toBe(true);
  });

  it("directly updates player calendar lists when visibility changes", () => {
    const qc = new QueryClient();
    const old = { id: "event", campaign_id: "campaign", harptos_year: 1492, harptos_month: 1, harptos_day: 2, player_visible: false, event_type: "campaign" };
    const visible = { ...old, player_visible: true };
    qc.setQueryData(["calendar-events", "player", "campaign", 1492], []);

    dispatchCampaignRealtimePlayer(qc, player, "calendar_events", { eventType: "UPDATE", old, new: visible });

    expect(qc.getQueryData(["calendar-events", "player", "campaign", 1492])).toEqual([visible]);
  });

  it("updates only journal lists whose filters the row satisfies", () => {
    const qc = new QueryClient();
    const mine = ["player_journal", "mine", "campaign"];
    const shared = ["player_journal", "shared", "campaign"];
    qc.setQueryData(mine, []);
    qc.setQueryData(shared, []);
    const row = { id: "entry", campaign_id: "campaign", user_id: "player", is_private: false, created_at: "2026-01-01" };

    dispatchCampaignRealtimePlayer(qc, player, "player_journal_entries", { eventType: "INSERT", old: {}, new: row });

    expect(qc.getQueryData(mine)).toEqual([row]);
    expect(qc.getQueryData(shared)).toEqual([]);
  });

  it("uses targeted invalidation for joined deities and rejects unknown tables", () => {
    const qc = new QueryClient();
    qc.setQueryData(["deities", "campaign"], []);
    qc.setQueryData(["deities", "other"], []);

    expect(dispatchCampaignRealtimePlayer(qc, dm, "deities", {
      eventType: "UPDATE", old: { id: "deity" }, new: { id: "deity", campaign_id: "campaign" },
    })).toBe(true);
    expect(qc.getQueryCache().find({ queryKey: ["deities", "campaign"], exact: true })?.state.isInvalidated).toBe(true);
    expect(qc.getQueryCache().find({ queryKey: ["deities", "other"], exact: true })?.state.isInvalidated).toBe(false);
    expect(dispatchCampaignRealtimePlayer(qc, dm, "notes", { eventType: "DELETE", old: { id: "note" }, new: { id: "note" } })).toBe(false);
  });
});
