import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import NoDmCampaignsNotice from "./NoDmCampaignsNotice.vue";
import { useUiStore } from "@/stores/ui";
import { lensRefusal } from "@/router/lens";

/**
 * #845. A player who clicks "DM" lands on a dashboard where every widget is
 * empty and nothing says why — which is how this reached us as "he became DM
 * of my campaign": the DM shell reads as having *become* a DM, and the
 * emptiness reads as someone else's data having been taken away.
 *
 * What needs pinning is not the copy but the three conditions, because the
 * dangerous failure is showing this too eagerly: telling a real DM they own
 * nothing while their campaign list is still loading would be a worse bug
 * than the one it fixes.
 */
const mocks = vi.hoisted(() => ({
  campaigns: undefined as unknown[] | undefined,
  isSuccess: false,
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useDmCampaigns: () => ({
    data: { value: mocks.campaigns },
    isSuccess: { value: mocks.isSuccess },
  }),
}));

vi.mock("@/composables/useModeSwitch", () => ({
  useModeSwitch: () => ({ switchMode: vi.fn() }),
}));

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(NoDmCampaignsNotice, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.campaigns = undefined;
  mocks.isSuccess = false;
  lensRefusal.value = null;
});

describe("NoDmCampaignsNotice", () => {
  it("tells a DM-lens account with no campaigns why the dashboard is empty", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toContain("not the DM of any campaign");
  });

  // The eager-render failure, and the reason `isSuccess` is checked at all:
  // `undefined` means "not answered yet", not "none".
  it("stays silent while the campaign list is still loading", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = undefined;
    mocks.isSuccess = false;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("");
  });

  it("stays silent for a DM who has campaigns", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [{ id: "c1" }];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("");
  });

  it("stays silent in the player lens, where an empty DM list means nothing", async () => {
    useUiStore().userMode = "player";
    mocks.campaigns = [];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("");
  });
});

// #847. Both conditions are true at once when the lens fence closes the only
// campaign a player-lens account had open; the specific card names it and
// carries the same button, so this one stands down rather than stacking.
describe("NoDmCampaignsNotice deferring to the lens notice", () => {
  it("stays silent while a lens refusal is being explained", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [];
    mocks.isSuccess = true;
    lensRefusal.value = { lens: "dm", role: "player" };
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("");
  });
});
