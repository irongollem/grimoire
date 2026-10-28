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
  spell: null as unknown,
  isLibrary: false,
  id: "missing",
  isDM: false,
  preview: false,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "spell-detail", params: { id: mocks.id }, query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/composables/useDetailModal", () => ({
  useDetailModal: () => ({ asModal: ref(false), close: vi.fn(), isMobile: ref(true) }),
}));
vi.mock("@/composables/spells/useSpellWithArt", () => ({
  useSpellWithArt: () => ({
    spell: ref(mocks.spell as Spell | null),
    isLibrarySpell: ref(mocks.isLibrary),
    isPending: ref(mocks.isLoading),
    error: ref(mocks.error),
  }),
}));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return mocks.isDM; } }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ get dmPreviewMode() { return mocks.preview; } }) }));

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
    mocks.spell = null;
    mocks.isLibrary = false;
    mocks.id = "missing";
    mocks.isDM = false;
    mocks.preview = false;
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

describe("SpellDetailView DM note", () => {
  const UUID = "4f2f0f6e-7a31-4b5e-9a45-3c1d9a6b2e10";
  const note = () => {
    mocks.spell = { id: UUID, name: "Hex", level: 1, school: "Enchantment" };
    mocks.id = UUID;
    return mountView().findComponent({ name: "SpellSheetMobile" }).props("showDmNote");
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.spell = null;
    mocks.isLibrary = false;
    mocks.id = "missing";
    mocks.isDM = false;
    mocks.preview = false;
  });

  it("offers the DM's private note on the DM's own custom spell", () => {
    mocks.isDM = true;
    expect(note()).toBe(true);
  });

  it("keeps it from a player, from the DM's player preview, and off a library spell", () => {
    expect(note()).toBe(false);
    mocks.isDM = true;
    mocks.preview = true;
    expect(note()).toBe(false);
    mocks.preview = false;
    mocks.isLibrary = true;
    expect(note()).toBe(false);
  });

  it("offers no note for a spell whose id is not a stored row", () => {
    mocks.isDM = true;
    mocks.spell = { id: "srd_hex", name: "Hex", level: 1, school: "Enchantment" };
    mocks.id = "srd_hex";
    expect(mountView().findComponent({ name: "SpellSheetMobile" }).props("showDmNote")).toBe(false);
  });
});
