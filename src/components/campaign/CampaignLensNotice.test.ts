import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import CampaignLensNotice from "./CampaignLensNotice.vue";
import { lensRefusal } from "@/router/lens";

/**
 * #847. The lens fence closes a campaign the current hat does not hold; this
 * is what stops that being a silent disappearance, which is the failure #845
 * was reported as.
 *
 * What is worth pinning is which of the three states it renders — the two
 * roles read as opposite sentences and getting them the wrong way round would
 * tell a DM they are a player of their own game — and that it says nothing
 * when nothing was refused.
 */
const switchMode = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useModeSwitch", () => ({
  useModeSwitch: () => ({ switchMode }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  lensRefusal.value = null;
});

afterEach(() => {
  lensRefusal.value = null;
});

describe("CampaignLensNotice", () => {
  it("says nothing when nothing was refused", async () => {
    const wrapper = mount(CampaignLensNotice);
    await flushPromises();

    expect(wrapper.text()).toBe("");
  });

  it("tells a DM-lens account it only plays in the campaign that was closed", async () => {
    lensRefusal.value = { lens: "dm", role: "player" };
    const wrapper = mount(CampaignLensNotice);
    await flushPromises();

    expect(wrapper.text()).toContain("You play in that campaign, you don't run it");
    expect(wrapper.text()).toContain("the DM view");
    expect(wrapper.text()).toContain("Switch to Player");
  });

  it("tells a player-lens account it runs the campaign that was closed", async () => {
    lensRefusal.value = { lens: "player", role: "dm" };
    const wrapper = mount(CampaignLensNotice);
    await flushPromises();

    expect(wrapper.text()).toContain("You run that campaign, you don't play in it");
    expect(wrapper.text()).toContain("the player portal");
    expect(wrapper.text()).toContain("Switch to DM");
  });

  // No membership at all: there is no other hat to offer, so offering one
  // would send the user somewhere the campaign also is not.
  it("offers no lens switch for a campaign this account is no longer in", async () => {
    lensRefusal.value = { lens: "dm", role: null };
    const wrapper = mount(CampaignLensNotice);
    await flushPromises();

    expect(wrapper.text()).toContain("no longer yours");
    expect(wrapper.text()).not.toContain("Switch to");
    expect(wrapper.text()).toContain("Dismiss");
  });

  it("switches lens on the offered click, and stops explaining once it has", async () => {
    lensRefusal.value = { lens: "dm", role: "player" };
    const wrapper = mount(CampaignLensNotice);
    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(switchMode).toHaveBeenCalledWith("player");
    expect(lensRefusal.value).toBeNull();
  });

  // One-shot: it explains the navigation that just happened. Left standing it
  // would follow the user around, re-appearing on a home they came back to for
  // an unrelated reason.
  it("forgets the refusal when it goes away", async () => {
    lensRefusal.value = { lens: "dm", role: "player" };
    const wrapper = mount(CampaignLensNotice);
    wrapper.unmount();

    expect(lensRefusal.value).toBeNull();
  });
});
