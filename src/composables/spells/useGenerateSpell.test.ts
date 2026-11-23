import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), campaignId: "c1" as string | null }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/spells/useSpells", () => ({ useCreateSpell: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaignId() { return mocks.campaignId; } }) }));
vi.mock("@/ai/useSpellGeneration", () => ({ useSpellGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/ai/spellAiAdapter", () => ({ spellInsertFromAi: (r: { name: string }) => ({ name: r.name, campaign_id: null }) }));

const { useGenerateSpell } = await import("./useGenerateSpell");

const generated = (over: Record<string, unknown> = {}) => ({ name: "Moth Storm", image_url: "https://img/s.webp", ...over });

describe("useGenerateSpell", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "s1" });
    mocks.generate.mockReset().mockResolvedValue(generated());
    mocks.campaignId = "c1";
    busy.value = false;
    genError.value = null;
  });

  it("stamps the active campaign on the spell, which the pure adapter never does", async () => {
    const outcome = await useGenerateSpell().generateAndCreateSpell("moths", { level: 3, generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith({ name: "Moth Storm", campaign_id: "c1" });
    expect(outcome).toEqual({ id: "s1", error: null, name: "Moth Storm", picture: "saved", pictureUrl: "https://img/s.webp" });
  });

  it("with no active campaign the spell is genuinely global", async () => {
    mocks.campaignId = null;
    await useGenerateSpell().generateAndCreateSpell("moths");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: null }));
  });

  it("reports a failed picture only when one was asked for", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateSpell().generateAndCreateSpell("moths", { generateImage: true })).picture).toBe("failed");
    expect((await useGenerateSpell().generateAndCreateSpell("moths", { generateImage: false })).picture).toBe("none");
  });

  it("creates nothing while another generation is running, and does not report a stale earlier error", async () => {
    busy.value = true;
    genError.value = "an old failure";
    expect(await useGenerateSpell().generateAndCreateSpell("moths")).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("creates nothing when generation returns nothing, and lets a failed save throw", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    genError.value = "Provider down";
    expect(await useGenerateSpell().generateAndCreateSpell("moths")).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateSpell().generateAndCreateSpell("moths")).rejects.toThrow("save failed");
  });
});
