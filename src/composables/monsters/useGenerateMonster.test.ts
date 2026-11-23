import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = ref(false);

vi.mock("@/composables/monsters/useMonsters", () => ({ useCreateMonster: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useMonsterGeneration", () => ({ useMonsterGeneration: () => ({ generate: mocks.generate, error: ref(null) }) }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", content: [{ type: "text", text: t }] }) }));
vi.mock("@/rules/statBlock/structureStatBlock", () => ({ structureStatBlock: (s: unknown) => s }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));

const { useGenerateMonster } = await import("./useGenerateMonster");

const generated = (over: Record<string, unknown> = {}) => ({
  name: "Mossbear", monster_type: "beast", size: "large", alignment: "unaligned", habitat: null, tags: [],
  description: "", notes: "", stat_block: {}, image_url: "https://img/m.webp", ...over,
});

describe("useGenerateMonster outcome", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "m1" });
    mocks.generate.mockReset().mockResolvedValue(generated());
    busy.value = false;
  });

  it("says the monster is saved with a picture that failed, so a caller can offer to paint it again", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    const outcome = await useGenerateMonster().generateAndCreateMonster("a bear", { generateImage: true });
    expect(outcome).toMatchObject({ id: "m1", name: "Mossbear", picture: "failed" });
  });

  it("does not call a picture nobody asked for a failure, and the importer's name override wins", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    const outcome = await useGenerateMonster().generateAndCreateMonster("a bear", { generateImage: false, nameOverride: "Old Grumble" });
    expect(outcome).toMatchObject({ id: "m1", name: "Old Grumble", picture: "none" });
  });

  it("creates nothing while another generation is running", async () => {
    busy.value = true;
    const outcome = await useGenerateMonster().generateAndCreateMonster("a bear");
    expect(outcome).toMatchObject({ id: null, name: null });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
