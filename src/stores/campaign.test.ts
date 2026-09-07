import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The store reaches for the vault and the theme on hydration; neither is under
// test here and @/lib/supabase throws at module load without env vars.
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
vi.mock("@/lib/apiKeyVault", () => ({ decryptApiKey: async () => "" }));
vi.mock("@/composables/useTheme", () => ({ useTheme: () => ({ setTheme: () => {} }) }));

import { useCampaignStore } from "./campaign";

const DM_SLOT = "grimoire_active_campaign_dm";
const PLAYER_SLOT = "grimoire_active_campaign_player";

describe("switchUserMode — the lens decides which campaign may be restored", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("restores the campaign the target lens remembers", () => {
    localStorage.setItem(DM_SLOT, "my-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {
      campaignsInTargetLens: new Set(["my-campaign"]),
    });

    expect(store.activeCampaignId).toBe("my-campaign");
  });

  it("drops a remembered campaign the target lens does not hold", () => {
    // Exactly the state an earlier build could write: the DM slot pointing at a
    // campaign this account only plays in. Restoring it is how the DM shell came
    // up on somebody else's game.
    localStorage.setItem(DM_SLOT, "someone-elses-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {
      campaignsInTargetLens: new Set(["my-campaign"]),
    });

    expect(store.activeCampaignId).toBeNull();
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
  });

  // Reversed by #845. This used to assert the opposite — that an unknown lens
  // restores blindly so "a failed lookup costs nothing". It does cost
  // something: a lookup that failed says nothing about whether the campaign is
  // allowed, and restoring on it puts the DM shell on a campaign the account
  // may only play in. That is the bug the guard exists to stop, reachable
  // through a network blip. Failing closed costs one click instead.
  it("refuses an unverifiable campaign rather than restoring it unchecked", () => {
    localStorage.setItem(DM_SLOT, "my-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {});

    expect(store.activeCampaignId).toBeNull();
    // And the slot is dropped, so the next switch does not retry a campaign
    // this lens has never been able to confirm.
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
  });

  it("files the outgoing campaign under the mode being left, not the one entered", () => {
    localStorage.setItem("grimoire_active_campaign", "the-game-im-playing");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", { campaignsInTargetLens: new Set() });

    expect(localStorage.getItem(PLAYER_SLOT)).toBe("the-game-im-playing");
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
    expect(store.activeCampaignId).toBeNull();
  });

  it("forgets the outgoing campaign when the caller asks it to", () => {
    localStorage.setItem("grimoire_active_campaign", "handed-over");
    localStorage.setItem(PLAYER_SLOT, "handed-over");
    const store = useCampaignStore();

    store.switchUserMode("dm", "player", {
      rememberCurrentCampaign: false,
      campaignsInTargetLens: new Set(["handed-over"]),
    });

    // The DM slot is cleared (the campaign is no longer theirs to DM) while the
    // player slot still points at it — this is the ownership-transfer path.
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
    expect(store.activeCampaignId).toBe("handed-over");
  });
});
