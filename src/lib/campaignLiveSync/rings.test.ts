import { describe, expect, it, vi } from "vitest";
import {
  doorbellTopic,
  emitCampaignJoinFailed,
  emitCampaignReconcile,
  emitCampaignRing,
  onCampaignJoinFailed,
  onCampaignReconcile,
  onCampaignRing,
} from "./rings";

describe("campaign rings", () => {
  it("reaches only the listeners of the table that rang", () => {
    const chat = vi.fn();
    const audio = vi.fn();
    const stopChat = onCampaignRing(["campaign_messages"], chat);
    const stopAudio = onCampaignRing(["soundboard_broadcast"], audio);

    emitCampaignRing("c1", { table: "campaign_messages" });
    emitCampaignRing("c1", { table: "campaign_messages" });

    expect(chat.mock.calls.map(([ring]) => ring)).toEqual([
      { campaignId: "c1", table: "campaign_messages" },
      { campaignId: "c1", table: "campaign_messages" },
    ]);
    expect(audio).not.toHaveBeenCalled();
    stopChat();
    stopAudio();
  });

  it("ignores a payload with no table", () => {
    const listener = vi.fn();
    const stop = onCampaignRing(["encounter_state"], listener);
    expect(emitCampaignRing("c1", { table: "encounter_state" })).toEqual({ campaignId: "c1", table: "encounter_state" });
    expect(emitCampaignRing("c1", {})).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops calling a listener once it unsubscribes", () => {
    const listener = vi.fn();
    const stop = onCampaignRing(["party_members"], listener);
    stop();
    emitCampaignRing("c1", { table: "party_members" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("tells reconcile listeners which campaign may have missed rings", () => {
    const listener = vi.fn();
    const stop = onCampaignReconcile(listener);
    emitCampaignReconcile("c1");
    stop();
    emitCampaignReconcile("c2");
    expect(listener.mock.calls).toEqual([["c1"]]);
  });

  it("names the doorbell apart from the campaign's presence channel", () => {
    // useCampaignPresence joins the public `campaign:<id>`; a shared name bound
    // the doorbell to that public channel and no private ring ever arrived.
    expect(doorbellTopic("c1")).toBe("doorbell:c1");
    expect(doorbellTopic("c1")).not.toBe("campaign:c1");
  });

  it("tells join-failure listeners which campaign's doorbell failed", () => {
    const listener = vi.fn();
    const stop = onCampaignJoinFailed(listener);
    emitCampaignJoinFailed("c1");
    stop();
    emitCampaignJoinFailed("c2");
    expect(listener.mock.calls).toEqual([["c1"]]);
  });
});
