import { mount as vtuMount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FirstRunTour from "./FirstRunTour.vue";
import { TOUR_FLAG_KEY } from "@/lib/tours/firstRunTours";
import { _resetModalStack, useModalStack } from "@/components/common/overlays/modalStack";

const h = vi.hoisted(() => ({
  drive: vi.fn(),
  onDestroyed: null as null | (() => void),
}));

const route = reactive({ name: "dashboard" as string });
const campaignStore = reactive({ activeCampaignId: null as string | null });

vi.mock("vue-router", () => ({ useRoute: () => route }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignStore }));
vi.mock("driver.js", () => ({
  driver: (config: { onDestroyed: () => void }) => {
    h.onDestroyed = config.onDestroyed;
    return { drive: h.drive };
  },
}));
vi.mock("driver.js/dist/driver.css", () => ({}));
vi.mock("@/lib/tours/firstRunTours", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tours/firstRunTours")>()),
  // The real steps are filtered by what is on screen; the gate is what is under test, not the anchors.
  buildTourSteps: () => [{ element: "body", popover: { title: "t", description: "d" } }],
  firstAnchorSelector: () => "body",
}));

// Every mounted tour is unmounted after its test: a leftover one still watches the shared route and would start too.
const mounted: { unmount: () => void }[] = [];
const mount: typeof vtuMount = ((...args: Parameters<typeof vtuMount>) => {
  const w = vtuMount(...args);
  mounted.push(w);
  return w;
}) as typeof vtuMount;

const settle = async () => {
  for (let i = 0; i < 5; i++) await flushPromises();
};

describe("FirstRunTour gate", () => {
  beforeEach(() => {
    h.drive.mockClear();
    h.onDestroyed = null;
    route.name = "dashboard";
    campaignStore.activeCampaignId = null;
    _resetModalStack();
    localStorage.setItem(TOUR_FLAG_KEY, "dm");
  });
  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
    localStorage.removeItem(TOUR_FLAG_KEY);
  });

  // Bug: a brand-new account with no campaign got the DM tour on top of the New Campaign dialog.
  it("does not start the DM tour while the account has no campaign, and keeps the flag", async () => {
    mount(FirstRunTour);
    await settle();
    expect(h.drive).not.toHaveBeenCalled();
    // Bug: a tour that never showed was recorded as seen, so the account never got it.
    expect(localStorage.getItem(TOUR_FLAG_KEY)).toBe("dm");
  });

  // Bug: the tour was only tried on route change, so a campaign made on the same visit never got it.
  it("starts once a campaign appears, on the same visit", async () => {
    mount(FirstRunTour);
    await settle();
    campaignStore.activeCampaignId = "c1";
    await settle();
    expect(h.drive).toHaveBeenCalledTimes(1);
  });

  // Bug: with a campaign but a modal open, the tour card sat over the dialog and swallowed its clicks.
  it("waits for an open modal to close, then starts", async () => {
    campaignStore.activeCampaignId = "c1";
    const state = reactive({ open: true });
    const scope = mount({ setup: () => { useModalStack(() => state.open); return () => null; } });
    mount(FirstRunTour);
    await settle();
    expect(h.drive).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOUR_FLAG_KEY)).toBe("dm");
    state.open = false;
    await settle();
    expect(h.drive).toHaveBeenCalledTimes(1);
    scope.unmount();
  });

  // Bug: gating the player tour on a campaign would hold back a player's first run (they have no campaign yet).
  it("starts the player tour without a campaign", async () => {
    localStorage.setItem(TOUR_FLAG_KEY, "player");
    route.name = "play-home";
    mount(FirstRunTour);
    await settle();
    expect(h.drive).toHaveBeenCalledTimes(1);
  });
});
