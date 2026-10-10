import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import SpellDetailView from "./SpellDetailView.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import type { Spell } from "@/types/spell.types";

const mocks = vi.hoisted(() => ({
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "spell-detail", params: { id: "missing" }, query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/composables/useDetailModal", () => ({
  useDetailModal: () => ({ asModal: ref(false), close: vi.fn(), isMobile: ref(true) }),
}));
vi.mock("@/composables/spells/useSpellWithArt", () => ({
  useSpellWithArt: () => ({
    spell: ref<Spell | null>(null),
    isLibrarySpell: ref(false),
    isPending: ref(mocks.isLoading),
    error: ref(mocks.error),
  }),
}));

function mountView() {
  return mount(SpellDetailView, {
    global: {
      stubs: {
        SpellDetailModal: true,
        SpellSheetMobile: true,
        SpellSheet: true,
        SpellDetail: true,
        PageHeader: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("SpellDetailView on a phone with no row", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.isLoading = false;
    mocks.error = null;
  });

  it("spins only while the spell is loading", () => {
    mocks.isLoading = true;
    expect(mountView().findComponent(LoadingSpinner).exists()).toBe(true);
  });

  it("shows the failed state, not a spinner, when the load errors", () => {
    mocks.error = new Error("boom");
    const wrapper = mountView();
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false);
    expect(wrapper.text()).toContain("Failed to load spell.");
  });

  it("says a spell does not exist rather than spinning", () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(false);
    expect(wrapper.text()).toContain("This spell doesn't exist, or it was deleted.");
  });
});
