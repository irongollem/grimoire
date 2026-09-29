import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: { value: [] } }),
}));

import { fetchWhisperRecipients } from "./useWhisperRecipients";

describe("fetchWhisperRecipients", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("returns the ids the server allows, asking for the given campaign", async () => {
    mocks.rpc.mockResolvedValue({ data: ["u2", "u3"], error: null });
    await expect(fetchWhisperRecipients("c1")).resolves.toEqual(["u2", "u3"]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_whisper_recipients", { p_campaign_id: "c1" });
  });

  it("throws the RPC error rather than reporting nobody to whisper", async () => {
    const boom = new Error("Not a member of this campaign");
    mocks.rpc.mockResolvedValue({ data: null, error: boom });
    await expect(fetchWhisperRecipients("c1")).rejects.toBe(boom);
  });
});
