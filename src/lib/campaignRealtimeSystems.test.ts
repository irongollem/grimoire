import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { dispatchCampaignRealtimeSystem } from "@/lib/campaignRealtimeSystems";

const context = { campaignId: "campaign-a", currentUserId: "user-a", isDM: true };
const event = (newRow: Record<string, unknown>, eventType: "INSERT" | "UPDATE" | "DELETE" = "INSERT") => ({
  eventType,
  new: newRow,
  old: eventType === "DELETE" ? newRow : {},
}) as const;

describe("dispatchCampaignRealtimeSystem", () => {
  it("updates only exact scheduling caches, including a filtered proposal list", () => {
    const qc = new QueryClient();
    qc.setQueryData(["session_proposals", "campaign-a"], []);
    qc.setQueryData(["session_proposals", "campaign-b"], []);
    const row = { id: "proposal-1", campaign_id: "campaign-a", proposed_date: "2026-08-03" };

    expect(dispatchCampaignRealtimeSystem(qc, "session_proposals", event(row), context)).toBe(true);
    expect(qc.getQueryData(["session_proposals", "campaign-a"])).toEqual([row]);
    expect(qc.getQueryData(["session_proposals", "campaign-b"])).toEqual([]);
  });

  it("invalidates player item projections instead of inserting a raw item into them", () => {
    const qc = new QueryClient();
    const oldProjection = [{ id: "old", name: "Visible", dm_notes: null }];
    qc.setQueryData(["items"], []);
    qc.setQueryData(["items", "player-visible"], oldProjection);
    qc.setQueryData(["global-search", "vis", "campaign-a"], []);
    const raw = { id: "item-1", campaign_id: "campaign-a", name: "DM-only", dm_notes: "secret" };

    dispatchCampaignRealtimeSystem(qc, "items", event(raw), context);

    expect(qc.getQueryData(["items"])).toEqual([raw]);
    expect(qc.getQueryData(["items", "player-visible"])).toEqual(oldProjection);
    expect(qc.getQueryState(["items", "player-visible"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["global-search", "vis", "campaign-a"])?.isInvalidated).toBe(true);
  });

  it("uses RLS-safe invalidation for player downtime events", () => {
    const qc = new QueryClient();
    const grants = [{ id: "grant-old", campaign_id: "campaign-a" }];
    qc.setQueryData(["downtime", "campaign-a", "grants"], grants);
    const row = { id: "grant-new", campaign_id: "campaign-a", created_at: "2026-08-03" };

    dispatchCampaignRealtimeSystem(qc, "downtime_grants", event(row), { ...context, isDM: false });

    expect(qc.getQueryData(["downtime", "campaign-a", "grants"])).toEqual(grants);
    expect(qc.getQueryState(["downtime", "campaign-a", "grants"])?.isInvalidated).toBe(true);
  });

  it("invalidates membership fan-out only for the affected current user", () => {
    const qc = new QueryClient();
    qc.setQueryData(["campaign-members", "campaign-a"], []);
    qc.setQueryData(["my-memberships"], []);
    qc.setQueryData(["campaigns"], []);
    const row = { id: "membership-1", campaign_id: "campaign-a", user_id: "user-a", joined_at: "2026-08-03" };

    dispatchCampaignRealtimeSystem(qc, "campaign_members", event(row), context);

    expect(qc.getQueryData(["campaign-members", "campaign-a"])).toEqual([row]);
    expect(qc.getQueryState(["my-memberships"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["campaigns"])?.isInvalidated).toBe(true);
  });
});
