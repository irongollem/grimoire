import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrapGeneratorPanel from "./TrapGeneratorPanel.vue";

const mocks = vi.hoisted(() => ({
  createTrap: vi.fn(),
  logImageGeneration: vi.fn(),
  push: vi.fn(),
  isAiEnabled: true,
  generate: vi.fn(),
  affordable: true,
  ui: { trapGeneratorOpen: true },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => mocks.ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return mocks.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai", group_portrait_url: "party.png" },
    decryptedOpenAiKey: null,
  }),
}));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useCreateTrap: () => ({ mutateAsync: mocks.createTrap }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: mocks.logImageGeneration }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => mocks.affordable, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", async () => {
  const { ref } = await import("vue");
  return {
    useCampaignProviders: () => ({
      textProvider: ref("openai"),
      textIsByok: ref(false),
      textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base),
      imageProvider: ref("openai"),
      imageIsByok: ref(false),
      imageMultiplier: ref(1), imageCredits: (base: number) => Math.ceil(base),
    }),
  };
});
vi.mock("@/ai/useTrapGeneration", () => ({
  useTrapGeneration: () => ({
    isGenerating: ref(false),
    error: ref(""),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
}));

function mountPanel() {
  return mount(TrapGeneratorPanel, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });
}

describe("TrapGeneratorPanel — AI availability", () => {
  beforeEach(() => {
    mocks.createTrap.mockReset();
    mocks.logImageGeneration.mockReset();
    mocks.push.mockReset();
    mocks.isAiEnabled = true;
  });

  it("shows a real Generate button — every plan may generate as long as AI is on", () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("Generate with AI");
    expect(wrapper.text()).not.toContain("AI is off for this campaign");
    expect(wrapper.text()).toContain("New Blank Trap");
  });

  it("shows AiOffNotice instead of a Generate button when the campaign's AI toggle is off", () => {
    mocks.isAiEnabled = false;
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("AI is off for this campaign");
    expect(wrapper.text()).toContain("Turn it on");
    // No generate control at all — not even a disabled/paywall one.
    const buttons = wrapper.findAll("button, a").map((b) => b.text());
    expect(buttons.some((t) => t.includes("Generate with AI"))).toBe(false);
  });
});

describe("TrapGeneratorPanel — generate and create", () => {
  const generated = {
    name: "Dart Wall", trap_type: "Mechanical", trigger_type: null, description: "Darts.", effect_description: null,
    detection_dc: 12, disarm_dc: 13, attack_bonus: null, save_type: null, save_dc: null, damage_entries: [],
    reset_type: null, cr: "1", trap_hp: null, trap_ac: null, notes: "", tags: [], image_url: "trap.png",
  };
  beforeEach(() => {
    mocks.createTrap.mockReset().mockResolvedValue({ id: "t1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    mocks.logImageGeneration.mockReset();
    mocks.push.mockReset();
    mocks.isAiEnabled = true;
    mocks.affordable = true;
    mocks.ui.trapGeneratorOpen = true;
  });
  const generate = async (w: ReturnType<typeof mountPanel>) => {
    await w.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
  };

  it("generates from the trimmed concept, saves the trap to this campaign, logs its picture and opens it", async () => {
    const w = mountPanel();
    await w.get("textarea").setValue("  A dart wall  ");
    await generate(w);
    expect(mocks.generate).toHaveBeenCalledWith("A dart wall", expect.objectContaining({ trap_type: undefined, groupPortraitUrl: null }));
    expect(mocks.createTrap).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: "campaign-1", name: "Dart Wall", image_url: "trap.png" }));
    expect(mocks.logImageGeneration).toHaveBeenCalledWith(expect.objectContaining({ kind: "trap", imageUrl: "trap.png", targetId: "t1" }));
    expect(mocks.push).toHaveBeenCalledWith("/traps/t1");
    expect(mocks.ui.trapGeneratorOpen).toBe(false);
  });

  it("a trap without a picture logs nothing to the gallery", async () => {
    mocks.generate.mockResolvedValue({ ...generated, image_url: null });
    const w = mountPanel();
    await w.get("textarea").setValue("A dart wall");
    await generate(w);
    expect(mocks.createTrap).toHaveBeenCalled();
    expect(mocks.logImageGeneration).not.toHaveBeenCalled();
  });

  it("does not generate, spend or navigate when the DM cannot afford it", async () => {
    mocks.affordable = false;
    const w = mountPanel();
    await w.get("textarea").setValue("A dart wall");
    await generate(w);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("creates nothing when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    const w = mountPanel();
    await w.get("textarea").setValue("A dart wall");
    await generate(w);
    expect(mocks.createTrap).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("sends the party portrait only when 'Add party to scene' is on", async () => {
    const w = mountPanel();
    await w.get("textarea").setValue("A dart wall");
    await w.get('button[role="switch"][aria-label="Add party to scene"]').trigger("click");
    await generate(w);
    expect(mocks.generate).toHaveBeenCalledWith("A dart wall", expect.objectContaining({ groupPortraitUrl: "party.png" }));
  });
});
