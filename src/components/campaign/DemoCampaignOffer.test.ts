import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { DemoStatus } from "@/composables/campaign/useDemoCampaign";
import type { Campaign } from "@/types/campaign.types";
import DemoCampaignOffer from "./DemoCampaignOffer.vue";

/**
 * The offer (#912) shows only while a demo is published and the account has
 * not already loaded one, and it must not swallow a failed load silently.
 */
const mocks = vi.hoisted(() => ({
  status: undefined as DemoStatus | undefined,
  isPending: false,
  mutateAsync: vi.fn<() => Promise<Campaign>>(),
  toastError: vi.fn(),
}));

// `isPending` is read as a bare identifier in the template (the same way real
// callers use TanStack Query's own returned ref), so the mock must be a real
// Vue ref — a plain `{ value }` object is not `isRef()`, so the SFC compiler's
// auto-unwrap leaves it untouched and the template sees a truthy object.
vi.mock("@/composables/campaign/useDemoCampaign", () => ({
  useDemoStatus: () => ({ data: { value: mocks.status } }),
  useLoadDemoCampaign: () => ({ mutateAsync: mocks.mutateAsync, isPending: ref(mocks.isPending) }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: mocks.toastError,
    fromError: (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback),
  }),
}));

function status(patch: Partial<DemoStatus> = {}): DemoStatus {
  return {
    published: true,
    version: "v1",
    demo_campaign_id: null,
    loaded_version: null,
    offered: true,
    template_name: null,
    ...patch,
  };
}

const campaign = { id: "demo-1", name: "Sugarwell" } as unknown as Campaign;

beforeEach(() => {
  mocks.status = undefined;
  mocks.isPending = false;
  mocks.mutateAsync = vi.fn().mockResolvedValue(campaign);
  mocks.toastError.mockClear();
});

describe("DemoCampaignOffer", () => {
  it("renders nothing when no demo is published", () => {
    mocks.status = status({ published: false });
    const wrapper = mount(DemoCampaignOffer);
    expect(wrapper.text()).toBe("");
  });

  it("renders nothing once the account already has a demo copy", () => {
    mocks.status = status({ demo_campaign_id: "already-mine" });
    const wrapper = mount(DemoCampaignOffer);
    expect(wrapper.text()).toBe("");
  });

  it("offers the full layout with its explanatory copy", () => {
    mocks.status = status();
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "full" } });
    expect(wrapper.text()).toContain("Late in the Kind Country");
    expect(wrapper.find("button").text()).toBe("Explore the demo");
  });

  it("offers the compact layout as a bare label", () => {
    mocks.status = status();
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "compact" } });
    expect(wrapper.text()).not.toContain("Late in the Kind Country");
    expect(wrapper.find("button").text()).toBe("Load the demo campaign instead");
  });

  it("offers the menu layout as a switcher row", () => {
    mocks.status = status();
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "menu" } });
    expect(wrapper.text()).not.toContain("Late in the Kind Country");
    expect(wrapper.find("button").text()).toBe("Load demo campaign");
  });

  it("loads the demo and emits the new campaign on click", async () => {
    mocks.status = status();
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "full" } });
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalled();
    expect(wrapper.emitted("loaded")?.[0]).toEqual([campaign]);
  });

  it("toasts a readable error rather than swallowing a failed load", async () => {
    mocks.status = status();
    mocks.mutateAsync.mockRejectedValue(new Error("demo already claimed"));
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "full" } });
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(mocks.toastError).toHaveBeenCalledWith("demo already claimed");
    expect(wrapper.emitted("loaded")).toBeUndefined();
  });

  it("disables the button while pending and shows the busy label", () => {
    mocks.status = status();
    mocks.isPending = true;
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "full" } });
    const button = wrapper.find("button");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.text()).toBe("Setting up the demo…");
  });

  it("also disables when the caller passes disabled for a sibling mutation", () => {
    mocks.status = status();
    const wrapper = mount(DemoCampaignOffer, { props: { layout: "compact", disabled: true } });
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
