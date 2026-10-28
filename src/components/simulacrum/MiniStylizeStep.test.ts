import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MiniStylizeStep from "./MiniStylizeStep.vue";
import type { Mini } from "@/types/mini.types";

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
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: () => 1 }) }));
const mocks = vi.hoisted(() => ({ stylize: vi.fn(), waitForStylize: vi.fn() }));
vi.mock("@/ai/useMiniForge", () => ({
  useMiniForge: () => ({
    stylize: mocks.stylize,
    waitForStylize: mocks.waitForStylize,
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

describe("MiniStylizeStep, running a stylize", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    requireCredits.mockReset().mockReturnValue(true);
    mocks.stylize.mockReset();
    mocks.waitForStylize.mockReset();
  });
  const button = (w: ReturnType<typeof mountStep>) => w.get('button[aria-label="Stylize portrait"]');

  it("sends the DM's note without its edge spaces, hands the result on and empties the note", async () => {
    const updated = { id: "m1" } as Mini;
    mocks.stylize.mockResolvedValue(updated);
    const wrapper = mountStep();
    await wrapper.get("input[type=text]").setValue("  more armour  ");
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.stylize.mock.calls[0][0].instructions).toBe("more armour");
    expect(wrapper.emitted("stylized")).toEqual([[updated]]);
    expect((wrapper.get("input[type=text]").element as HTMLInputElement).value).toBe("");
  });

  it("sends no instructions when the note is blank", async () => {
    mocks.stylize.mockResolvedValue({ id: "m1" } as Mini);
    const wrapper = mountStep();
    await wrapper.get("input[type=text]").setValue("   ");
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.stylize.mock.calls[0][0].instructions).toBeUndefined();
  });

  it("does nothing, and keeps the note, when the likeness notice is declined", async () => {
    mocks.stylize.mockResolvedValue(null);
    const wrapper = mountStep();
    await wrapper.get("input[type=text]").setValue("more armour");
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.emitted("stylized")).toBeUndefined();
    expect((wrapper.get("input[type=text]").element as HTMLInputElement).value).toBe("more armour");
  });

  it("says why it failed and stays put", async () => {
    mocks.stylize.mockRejectedValue(new Error("The renderer refused that portrait."));
    const wrapper = mountStep();
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("The renderer refused that portrait.");
    expect(wrapper.emitted("stylized")).toBeUndefined();
  });

  it("picks up a render that was already running when the forge reopened, once", async () => {
    const finished = { id: "m1" } as Mini;
    mocks.waitForStylize.mockResolvedValue(finished);
    const wrapper = mount(MiniStylizeStep, {
      props: {
        mini: { id: "m1", stylize_job_id: "job-1", stylized_image_url: null } as Mini,
        sourcePortraitUrl: null,
        sourceTable: "npcs",
        sourceId: "npc-1",
        format: "print",
        campaignId: "campaign-1",
      },
      global: { stubs: { GenerationCostBadge: true, RouterLink: RouterLinkStub } },
    });
    await flushPromises();
    expect(mocks.waitForStylize).toHaveBeenCalledWith("m1", "job-1");
    expect(wrapper.emitted("stylized")).toEqual([[finished]]);
    await wrapper.setProps({ mini: { id: "m1", stylize_job_id: "job-1", stylized_image_url: null } as Mini });
    expect(mocks.waitForStylize).toHaveBeenCalledTimes(1);
  });
});
