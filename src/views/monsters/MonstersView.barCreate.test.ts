import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { barCreateAction } from "@/composables/useBarCreate";
import MonstersView from "./MonstersView.vue";

const mocks = vi.hoisted(() => ({ push: vi.fn(), canCreate: true }));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ path: "/monsters", query: {} }),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useIsMobile: () => ref(true),
}));
vi.mock("@/composables/useDetailModal", () => ({ useDetailModal: () => ({ showList: ref(true) }) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(mocks.canCreate) }) }));
vi.mock("@/composables/monsters/useMonsterBrowse", () => ({ useMonsterBrowse: () => ({ total: ref(0) }) }));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => "" }) }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useEnabledSources: () => ({ data: ref([]) }),
  useAvailableLibrarySources: () => ({ data: ref([]), isLoading: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: false, activeCampaignId: "c1" }) }));

let wrapper: ReturnType<typeof shallowMount> | null = null;

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.push.mockReset();
  mocks.canCreate = true;
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

// #1187: the Bestiary's phone layout has no header, so its ListCreateButton
// never mounts and the DM bar's "+" is the only way to make a monster.
describe("MonstersView and the DM bar's create", () => {
  it("lends the phone Bestiary's create to the bar, so '+' is not dead there", () => {
    wrapper = shallowMount(MonstersView);
    barCreateAction.value?.run();
    expect(mocks.push).toHaveBeenCalledWith("/monsters/new");
  });

  it("keeps the monster quota on the bar's '+': over quota it opens the paywall, not the editor", () => {
    mocks.canCreate = false;
    wrapper = shallowMount(MonstersView);
    barCreateAction.value?.run();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
