import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import DmCampaignGate from "./DmCampaignGate.vue";
import { useUiStore } from "@/stores/ui";

/**
 * DM mode requires a campaign. A player-only account that clicked "DM" could
 * walk into the Atlas and try to build there with nothing to build it in —
 * which reached us as "I can't create locations".
 *
 * The dangerous failure is still over-eager blocking: gating a real DM behind
 * "start your campaign" while their list is loading, or locking a campaign-less
 * DM out of the billing and account pages they may need to get one.
 */
const mocks = vi.hoisted(() => ({
  campaigns: undefined as unknown[] | undefined,
  isSuccess: false,
  meta: {} as Record<string, unknown>,
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useDmCampaigns: () => ({
    data: { value: mocks.campaigns },
    isSuccess: { value: mocks.isSuccess },
  }),
  useDmArchivedCampaigns: () => ({ data: { value: [] } }),
}));

vi.mock("@/composables/useModeSwitch", () => ({
  useModeSwitch: () => ({ switchMode: vi.fn() }),
}));

vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: { value: true } }),
}));

vi.mock("@/components/campaign/NewCampaignModal.vue", () => ({
  __esModule: true,
  default: defineComponent({
    props: { modelValue: Boolean },
    setup: (props) => () => h("div", { "data-test": "new-campaign-modal", "data-open": String(props.modelValue) }),
  }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ meta: mocks.meta }),
  useRouter: () => ({ push: vi.fn() }),
}));

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(DmCampaignGate, {
    slots: { default: () => h("p", "the page") },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.campaigns = undefined;
  mocks.isSuccess = false;
  mocks.meta = {};
});

describe("DmCampaignGate", () => {
  it("stands in for the page and opens the new-campaign flow when the DM lens holds no campaign", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toContain("Start your campaign");
    expect(wrapper.text()).not.toContain("the page");
    expect(wrapper.find('[data-test="new-campaign-modal"]').attributes("data-open")).toBe("true");
  });

  it("renders the page while the campaign list is still loading", async () => {
    useUiStore().userMode = "dm";
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("the page");
  });

  it("renders the page for a DM who has campaigns", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [{ id: "c1" }];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("the page");
  });

  it("lets account-scoped and admin routes through", async () => {
    useUiStore().userMode = "dm";
    mocks.campaigns = [];
    mocks.isSuccess = true;

    mocks.meta = { accountScoped: true };
    expect(render().text()).toBe("the page");

    mocks.meta = { requiresAdmin: true };
    expect(render().text()).toBe("the page");
  });

  it("does nothing in the player lens, where an empty DM list means nothing", async () => {
    useUiStore().userMode = "player";
    mocks.campaigns = [];
    mocks.isSuccess = true;
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).toBe("the page");
  });
});
