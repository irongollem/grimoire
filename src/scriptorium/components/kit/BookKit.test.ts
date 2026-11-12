// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookKit from "./BookKit.vue";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";

vi.mock("@/scriptorium/composables/useKitCampaignEntries", () => ({
  useKitCampaignEntries: () => ({ entries: computed(() => []), isLoading: ref(false) }),
}));

beforeEach(() => setActivePinia(createPinia()));

describe("BookKit", () => {
  // Fails on: the kit ignoring the toolbar's request, so From the campaign shows the tab but leaves the cursor in the page.
  it("puts the cursor in its search when the toolbar asks for the campaign", async () => {
    const wrapper = mount(BookKit, {
      props: { editor: undefined, isTwoColumn: false },
      attachTo: document.body,
      global: { stubs: { KitArtSection: true } },
    });
    expect(document.activeElement).not.toBe(wrapper.find("[data-testid=kit-search]").element);
    useScriptoriumUiStore().askForCampaignSearch();
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.find("[data-testid=kit-search]").element);
    wrapper.unmount();
  });
});
