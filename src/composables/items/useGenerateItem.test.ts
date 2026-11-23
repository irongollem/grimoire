import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), createConnection: vi.fn() }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/items/useItems", () => ({ useCreateItem: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.createConnection }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: () => "boom" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useItemGeneration", () => ({ useItemGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/lib/items/generatedItemPayload", () => ({
  generatedItemPayload: (result: { name: string }, campaignId: string | null) => ({ name: result.name, campaign_id: campaignId }),
}));

const { useGenerateItem } = await import("./useGenerateItem");

const generated = (over: Record<string, unknown> = {}) => ({ name: "Stormbone Staff", image_url: "https://img/i.webp", ...over });

describe("useGenerateItem", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "i1" });
    mocks.generate.mockReset().mockResolvedValue(generated());
    mocks.createConnection.mockReset().mockResolvedValue(undefined);
    busy.value = false;
    genError.value = null;
  });

  it("creates the generated item in the campaign it was generated for and names it", async () => {
    const outcome = await useGenerateItem().generateAndCreateItem("a storm staff", { generateImage: true });
    expect(mocks.generate).toHaveBeenCalledWith("a storm staff", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith({ name: "Stormbone Staff", campaign_id: "c1" });
    expect(outcome).toEqual({ id: "i1", error: null, name: "Stormbone Staff", picture: "saved", linkErrors: [] });
  });

  it("says the item is saved with a picture that failed, so a caller can offer to paint it again", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateItem().generateAndCreateItem("a staff", { generateImage: true })).picture).toBe("failed");
  });

  it("does not call a picture nobody asked for a failure", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateItem().generateAndCreateItem("a staff", { generateImage: false })).picture).toBe("none");
  });

  it("creates nothing while another generation is running, and does not report a stale earlier error", async () => {
    busy.value = true;
    genError.value = "an old failure";
    const outcome = await useGenerateItem().generateAndCreateItem("a staff");
    expect(outcome).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("creates nothing when generation returns nothing, and carries its error", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    const outcome = await useGenerateItem().generateAndCreateItem("a staff");
    expect(outcome).toMatchObject({ id: null, error: "Provider down", name: null });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say the generation was paid for", async () => {
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateItem().generateAndCreateItem("a staff")).rejects.toThrow("save failed");
  });

  describe("links", () => {
    const carriedBy = typeChoices("item", "npc").find((c) => c.key === "carries")!;
    const guardedBy = typeChoices("item", "faction").find((c) => c.key === "guards")!;
    const brenna: GeneratorLink = { kind: "npc", id: "n1", name: "Brenna", choice: carriedBy };
    const guild: GeneratorLink = { kind: "faction", id: "f1", name: "The Guild", choice: guardedBy };

    // Bug caught: ties chosen in the panel never reached the saved item.
    it("writes each tie to the saved item, in the campaign the run started in", async () => {
      const outcome = await useGenerateItem().generateAndCreateItem("a staff", { links: [brenna, guild] });
      expect(outcome.linkErrors).toEqual([]);
      expect(mocks.createConnection.mock.calls.map(([arg]) => arg)).toEqual([
        { input: { subject: { kind: "item", id: "i1" }, other: { kind: "npc", id: "n1", name: "Brenna" }, choice: carriedBy }, campaignId: "c1" },
        { input: { subject: { kind: "item", id: "i1" }, other: { kind: "faction", id: "f1", name: "The Guild" }, choice: guardedBy }, campaignId: "c1" },
      ]);
    });

    // Bug caught: a failed tie threw out of the workflow and the page lost the item it had just saved.
    it("reports a failed tie in the outcome and keeps the item and the other ties", async () => {
      mocks.createConnection.mockRejectedValueOnce(new Error("denied"));
      const outcome = await useGenerateItem().generateAndCreateItem("a staff", { links: [brenna, guild] });
      expect(outcome.id).toBe("i1");
      expect(outcome.linkErrors).toEqual(["Brenna: boom"]);
      expect(mocks.createConnection).toHaveBeenCalledTimes(2);
    });

    // Bug caught: the model was not told about the ties, and links leaked into the generator's own options.
    it("tells the model the ties in the prompt and keeps `links` out of the generation options", async () => {
      await useGenerateItem().generateAndCreateItem("a staff", { links: [brenna], rarity: "rare" });
      expect(mocks.generate).toHaveBeenCalledWith("a staff\n\nTies: carried by Brenna", { rarity: "rare" });
    });
  });
});
