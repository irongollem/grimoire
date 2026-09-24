import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MiniStylizeStep from "./MiniStylizeStep.vue";

const isAiEnabled = ref(true);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 5 }),
}));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
const mocks = vi.hoisted(() => ({ stylize: vi.fn() }));
vi.mock("@/ai/useMiniForge", () => ({
  useMiniForge: () => ({
    stylize: mocks.stylize,
    waitForStylize: vi.fn(),
    isStylizing: ref(false),
  }),
}));

function mountStep() {
  return mount(MiniStylizeStep, {
    props: {
      mini: null,
      sourcePortraitUrl: "https://example.test/portrait.png",
      sourceTable: "npcs",
      sourceId: "npc-1",
      format: "print",
      campaignId: "campaign-1",
    },
    global: {
      stubs: { GenerationCostBadge: true, RouterLink: RouterLinkStub },
    },
  });
}

// Every plan may generate as long as AI is on and the account can afford it —
// there is no Pro gate on Simulacrum forging (see ai-policy-spec.md).
describe("MiniStylizeStep — AI-on/off, every plan", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
  });

  it("shows the real Stylize portrait button once AI is on", () => {
    const wrapper = mountStep();
    expect(wrapper.find('button[aria-label="Stylize portrait"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("AI is off for this campaign");
  });

  it("shows AiOffNotice instead of the Stylize button when AI is off", () => {
    isAiEnabled.value = false;
    const wrapper = mountStep();
    expect(wrapper.find('button[aria-label="Stylize portrait"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });
});

// The Stylize button must not disable itself for a short balance — clicking
// it is what opens the shared out-of-credits dialog via `requireCredits`.
describe("MiniStylizeStep — credit gate", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    requireCredits.mockReset();
    mocks.stylize.mockReset();
  });

  it("stays enabled-looking when short on credits", () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountStep();
    expect(wrapper.get('button[aria-label="Stylize portrait"]').attributes("disabled")).toBeUndefined();
  });

  it("opens the out-of-credits dialog instead of stylizing when short on credits", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountStep();

    await wrapper.get('button[aria-label="Stylize portrait"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.stylize).not.toHaveBeenCalled();
  });

  it("stylizes once requireCredits allows it", async () => {
    requireCredits.mockReturnValue(true);
    const wrapper = mountStep();

    await wrapper.get('button[aria-label="Stylize portrait"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.stylize).toHaveBeenCalledTimes(1);
  });
});
