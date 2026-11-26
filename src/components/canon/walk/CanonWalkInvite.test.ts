import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useAskUiStore } from "@/stores/ui/ask";
import CanonWalkInvite from "./CanonWalkInvite.vue";

describe("CanonWalkInvite", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  // Bug caught: Not now dismissing every campaign, or none: the flag is kept per campaign.
  it("Not now dismisses the invitation for this campaign only", async () => {
    useCampaignStore().activeCampaignId = "c1";
    const w = mount(CanonWalkInvite, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });
    await w.find("[data-testid=walk-invite-dismiss]").trigger("click");
    expect(useCanonUiStore().walkInviteDismissed).toEqual({ c1: true });
  });

  // Bug caught: the button still linking to the retired walk page, so the DM never reaches the Familiar's walk.
  it("Design it with me opens the walk in the Familiar", async () => {
    const w = mount(CanonWalkInvite, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });
    await w.get("[data-testid=walk-invite-start]").trigger("click");
    expect(useAskUiStore().pendingWalk).toBe(true);
  });

  // Bug caught: Not now with no campaign writing a flag under the key "null".
  it("writes nothing when there is no campaign", async () => {
    useCampaignStore().activeCampaignId = null;
    const w = mount(CanonWalkInvite, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });
    await w.find("[data-testid=walk-invite-dismiss]").trigger("click");
    expect(useCanonUiStore().walkInviteDismissed).toEqual({});
  });
});
