import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TilePackManagerView from "./TilePackManagerView.vue";

const isAiEnabled = ref(true);

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: "campaign-1",
    get isAiEnabled() {
      return isAiEnabled.value;
    },
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(true) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 12 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
vi.mock("@/composables/cartographer/useTilePacks", () => ({
  useTilePacks: () => ({
    campaignPacks: { data: ref([]), isPending: ref(false) },
    runs: { data: ref([]) },
    upload: mutation(),
    share: mutation(),
    remove: mutation(),
    createRun: mutation(),
    runUntilPause: vi.fn(),
    action: mutation(),
    signJobAssets: vi.fn(),
  }),
}));

function mountView() {
  return mount(TilePackManagerView, {
    global: {
      stubs: { PageHeader: { template: "<div><slot /></div>" }, ManualHelpLink: true },
    },
  });
}

describe("TilePackManagerView with AI off", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
  });

  it("offers generation when AI is on", () => {
    expect(mountView().text()).toContain("Generate a complete pack");
  });

  it("hides generation entirely, with no notice, and keeps manual upload", () => {
    isAiEnabled.value = false;
    const text = mountView().text();
    expect(text).not.toContain("Generate a complete pack");
    expect(text).not.toContain("Generation runs");
    expect(text).toContain("Upload a pack");
  });
});
