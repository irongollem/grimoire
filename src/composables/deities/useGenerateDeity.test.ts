import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  createDeity: vi.fn(), createNote: vi.fn(), log: vi.fn(), generate: vi.fn(), clearCompleted: vi.fn(),
}));
const busy = ref(false);
const error = ref<string | null>(null);
const concept = ref("");

vi.mock("@/composables/deities/useDeities", () => ({ useCreateDeity: () => ({ mutateAsync: mocks.createDeity }) }));
vi.mock("@/composables/notes/useEntityNotes", () => ({ useCreateEntityNote: () => ({ mutateAsync: mocks.createNote }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({ useImageGenerationLog: () => ({ logImageGeneration: mocks.log }) }));
vi.mock("@/ai/useDeityGeneration", () => ({
  useDeityGeneration: () => ({ generate: mocks.generate, error, concept, clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", text: t }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));

const { useGenerateDeity } = await import("./useGenerateDeity");

const generated = (over: Record<string, unknown> = {}) => ({
  name: "Vesper", titles: [], alternate_names: [], alignment: null, symbol: "a lamp", portrait_url: null,
  domains: [], portfolio: "crossroads", description: "", tags: [], dm_notes: "", ai_provenance: null, ...over,
});
const input = { generateImage: false };

describe("useGenerateDeity", () => {
  beforeEach(() => {
    mocks.createDeity.mockReset().mockResolvedValue({ id: "d1", campaign_id: "c1" });
    mocks.createNote.mockReset().mockResolvedValue({});
    mocks.log.mockReset();
    mocks.generate.mockReset().mockResolvedValue(generated());
    busy.value = false;
    error.value = null;
  });

  it("sends only the chosen pantheon's deities to the model, and files the deity under it", async () => {
    const pantheon = { id: "pan1", name: "The Hollow Court" };
    const deities = [
      { pantheon_id: "pan1", name: "Orrin", portfolio: "frost" },
      { pantheon_id: "other", name: "Kest", portfolio: "storms" },
    ];
    const { generateAndCreateDeity } = useGenerateDeity();
    await generateAndCreateDeity("a goddess", { ...input, pantheon, deities, alignment: "Neutral Good" });
    expect(mocks.generate.mock.calls[0][1]).toMatchObject({
      pantheonName: "The Hollow Court",
      pantheonDeities: [{ name: "Orrin", portfolio: "frost" }],
      alignment: "Neutral Good",
      generateImage: false,
    });
    expect(mocks.createDeity).toHaveBeenCalledWith(expect.objectContaining({ pantheon_id: "pan1", alignment: "Neutral Good" }));
  });

  it("writes the secrets as a private note, and none when there are none", async () => {
    mocks.generate.mockResolvedValue(generated({ dm_notes: "She sells maps to the dead." }));
    await useGenerateDeity().generateAndCreateDeity("a goddess", input);
    expect(mocks.createNote).toHaveBeenCalledWith(expect.objectContaining({ entity_type: "deity", entity_id: "d1", is_private: true }));
    mocks.createNote.mockClear();
    mocks.generate.mockResolvedValue(generated({ dm_notes: "  " }));
    await useGenerateDeity().generateAndCreateDeity("a goddess", input);
    expect(mocks.createNote).not.toHaveBeenCalled();
  });

  it("keeps the deity when its secrets note fails, reporting it instead of throwing", async () => {
    mocks.generate.mockResolvedValue(generated({ dm_notes: "secret" }));
    mocks.createNote.mockRejectedValue(new Error("rls"));
    const outcome = await useGenerateDeity().generateAndCreateDeity("a goddess", input);
    expect(outcome.deity).toMatchObject({ id: "d1", name: "Vesper" });
    expect(outcome.deity?.notesFailure).toBeInstanceOf(Error);
    expect(mocks.createDeity).toHaveBeenCalledTimes(1);
  });

  it("lets a failed deity save throw, writing no note", async () => {
    mocks.generate.mockResolvedValue(generated({ dm_notes: "secret" }));
    mocks.createDeity.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateDeity().generateAndCreateDeity("a goddess", input)).rejects.toThrow("save failed");
    expect(mocks.createNote).not.toHaveBeenCalled();
  });

  it("logs the portrait to the gallery only when there is one, and says whether it was painted", async () => {
    mocks.generate.mockResolvedValue(generated({ portrait_url: "https://img/d.webp" }));
    expect(await useGenerateDeity().generateAndCreateDeity("a goddess", { generateImage: true })).toMatchObject({ picture: "saved" });
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ kind: "deity", targetId: "d1", imageUrl: "https://img/d.webp" }));
    mocks.log.mockClear();
    mocks.generate.mockResolvedValue(generated());
    expect(await useGenerateDeity().generateAndCreateDeity("a goddess", { generateImage: true })).toMatchObject({ picture: "failed" });
    expect(await useGenerateDeity().generateAndCreateDeity("a goddess", { generateImage: false })).toMatchObject({ picture: "none" });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("creates nothing while another generation is running, and says why when generation fails", async () => {
    busy.value = true;
    expect(await useGenerateDeity().generateAndCreateDeity("a goddess", input)).toMatchObject({ deity: null });
    expect(mocks.generate).not.toHaveBeenCalled();
    busy.value = false;
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    expect(await useGenerateDeity().generateAndCreateDeity("a goddess", input)).toMatchObject({ deity: null, error: "Provider down" });
    expect(mocks.createDeity).not.toHaveBeenCalled();
  });
});
