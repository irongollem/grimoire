import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import type { VueWrapper } from "@vue/test-utils";
import DowngradeCampaignPickerModal from "./DowngradeCampaignPickerModal.vue";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/campaign/useCampaigns", async () => {
  const { ref } = await import("vue");
  return {
    useAllDmCampaigns: () => ({ data: ref([]) }),
    useArchiveCampaign: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  };
});

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function render(childAccount: boolean, campaignLimit = 2) {
  wrapper = mount(DowngradeCampaignPickerModal, {
    props: { show: true, campaignLimit, childAccount },
    global: { plugins: [createPinia(), VueQueryPlugin], stubs: { teleport: true } },
    attachTo: document.body,
  });
  return wrapper;
}

describe("DowngradeCampaignPickerModal copy", () => {
  it("never shows a young player anything about plans, Pro or upgrading", () => {
    render(true);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Your account can have 2 active campaigns.");
    expect(text).not.toMatch(/upgrad|plan|pro\b/i);
  });

  it("keeps the adult copy for everyone else", () => {
    render(false, 1);
    const text = document.body.textContent ?? "";
    expect(text).toContain("You're now on the free plan (1 active campaign).");
    expect(text).toContain("restored by upgrading");
    expect(text).toContain("Upgrade to Pro instead");
  });
});
