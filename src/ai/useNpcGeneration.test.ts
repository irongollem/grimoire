import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/ai/localKeyMode", () => ({ textRunsOnLocalKey: async () => false }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2014") }) }));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: async () => true }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useImageGeneration", () => ({
  captureImageGenerationContext: async () => ({ campaignId: "c1", world: null }),
  captureFailureMessage: () => "no",
  generateImage: mocks.generateImage,
}));

const { useNpcGeneration } = await import("./useNpcGeneration");

describe("useNpcGeneration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.invoke.mockReset();
    mocks.generateImage.mockReset();
    mocks.generateImage.mockResolvedValue("https://img/p.webp");
  });

  // Bug caught: a halfling ferryman painted as a tall human, because the picture was painted from the text model's
  // description alone and that never named the species (live run, 23 Nov 2026).
  it("paints the portrait with the record's species leading the subject", async () => {
    mocks.invoke.mockResolvedValue({
      data: { name: "Bram", race: "Halfling", true_portrait_prompt: "A weathered old ferryman with a lantern." },
      error: null,
    });
    await useNpcGeneration().generate("an old ferryman", { generateImage: true });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "npc_portrait",
      subject: expect.stringMatching(/^A halfling, one of the small folk.*A weathered old ferryman with a lantern\.$/),
    }));
  });
});
