import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  generateImage: vi.fn(),
  /** Species rows per table, and which campaign the campaign's own were read for. */
  species: { species: [] as { name: string; image_url: string | null }[], library_species: [] as { name: string; image_url: string | null }[] },
  speciesCampaign: [] as unknown[],
  speciesError: null as Error | null,
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: "species" | "library_species") => {
      const result = { data: mocks.species[table], error: mocks.speciesError };
      const chain = {
        select: () => chain,
        eq: (_column: string, value: unknown) => { mocks.speciesCampaign.push(value); return chain; },
        not: () => Promise.resolve(result),
      };
      return chain;
    },
  },
}));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: async () => true }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useImageGeneration", () => ({
  captureImageGenerationContext: async () => ({ campaignId: "c1" }),
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
    mocks.species = { species: [], library_species: [] };
    mocks.speciesCampaign = [];
    mocks.speciesError = null;
  });

  // Bug caught: a failed read of the optional species picture skipping the portrait the DM paid for.
  it("still paints the portrait, without a reference, when the species lookup fails", async () => {
    mocks.speciesError = new Error("read failed");
    mocks.invoke.mockResolvedValue({
      data: { name: "Bram", race: "Halfling", true_portrait_prompt: "A weathered old ferryman." },
      error: null,
    });
    const result = await useNpcGeneration().generate("an old ferryman", { generateImage: true });
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(mocks.generateImage.mock.calls[0]?.[0]).not.toHaveProperty("referenceUrls");
    expect(result?.portrait_url).toBe("https://img/p.webp");
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

  // Bug caught: a text function quietly painting a second, unrecorded picture. The picture is painted by the one image
  // job (generateImage); a body field asking generate-npc to paint would bill and return art nothing records.
  it("asks generate-npc for text only and paints through the image job", async () => {
    mocks.invoke.mockResolvedValue({
      data: { name: "Bram", race: "Halfling", true_portrait_prompt: "A weathered old ferryman." },
      error: null,
    });
    await useNpcGeneration().generate("an old ferryman", { generateImage: true });
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(body).not.toHaveProperty("generate_image");
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a homebrew people painted as a human, because the image model has never heard of them.
  it("sends this campaign's picture of the species as a reference, and says it is for the species only", async () => {
    mocks.species = {
      species: [{ name: "Thornkin", image_url: "https://img/thornkin.webp" }],
      library_species: [{ name: "Thornkin", image_url: "https://img/other.webp" }],
    };
    mocks.invoke.mockResolvedValue({ data: { name: "Bryn", race: "Thornkin", true_portrait_prompt: "A gardener." }, error: null });
    await useNpcGeneration().generate("a gardener", { generateImage: true });
    const request = mocks.generateImage.mock.calls[0][0];
    expect(request.referenceUrls).toEqual(["https://img/thornkin.webp"]);
    expect(request.subject).toMatch(/The reference picture shows what a thornkin looks like/);
    expect(mocks.speciesCampaign).toEqual(["c1"]);
  });

  // Bug caught: a reference sent with nothing to say what it is, so the portrait copies its pose and clothes; or an
  // empty reference list sent on every portrait.
  it("sends no reference, and no reference wording, for a species with no picture", async () => {
    mocks.invoke.mockResolvedValue({ data: { name: "Bram", race: "Halfling", true_portrait_prompt: "A ferryman." }, error: null });
    await useNpcGeneration().generate("a ferryman", { generateImage: true });
    const request = mocks.generateImage.mock.calls[0][0];
    expect(request).not.toHaveProperty("referenceUrls");
    expect(request.subject).not.toMatch(/reference picture/);
  });
});
