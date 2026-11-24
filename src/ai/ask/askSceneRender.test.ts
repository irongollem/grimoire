import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ start: vi.fn(), ack: vi.fn() }));
const scene = vi.hoisted(() => ({ entities: [] as { label: string; portraitUrl?: string }[], loading: false, text: { value: "" }, wanted: [] as boolean[] }));

vi.mock("@/ai/ask/askSceneMentions", () => ({
  useAskSceneMentions: (enabled: () => boolean) => ({
    text: scene.text,
    entities: { get value() { scene.wanted.push(enabled()); return scene.entities; } },
    loading: { get value() { return scene.loading; } },
    mentionItems: ref([]),
  }),
}));
vi.mock("@/ai/useChroniclerImageGeneration", () => ({ startChroniclerImage: mocks.start }));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: mocks.ack }) }));

const { useAskSceneRender } = await import("./askSceneRender");

describe("useAskSceneRender", () => {
  beforeEach(() => {
    mocks.start.mockReset().mockResolvedValue({ jobId: "j1" });
    mocks.ack.mockReset().mockResolvedValue(true);
    Object.assign(scene, { entities: [], loading: false, wanted: [] });
    scene.text.value = "";
  });

  // Bug caught: every card quote reading the whole campaign's people and places, though the scene names none.
  it("reads nothing and says nothing for a scene with no @mention", () => {
    const read = useAskSceneRender().read("a stormy keep");
    expect(read).toEqual({ entities: [], loading: false, line: null });
    expect(scene.wanted).toEqual([]);
  });

  // Bug caught: a mention that matched nobody painting silently from words alone, which the dialog warned about.
  it("says when a mention matched no known character", () => {
    expect(useAskSceneRender().read("@Nobody in the ruins").line?.value).toContain("No @mention matched");
  });

  it("names the characters it found and how many pictures will be read", () => {
    scene.entities = [{ label: "Aria", portraitUrl: "a.webp" }, { label: "Thorin" }];
    expect(useAskSceneRender().read("@Aria and @Thorin").line?.value).toBe("Aria, Thorin (pictures of 1 read)");
  });

  it("waits while the lists a mention is looked up in have not arrived", () => {
    scene.loading = true;
    expect(useAskSceneRender().read("@Aria in the keep").loading).toBe(true);
  });

  // Bug caught: a scene with a portrait reference painted without the likeness notice (the server refuses it after the charge is held).
  it("asks for the likeness notice only when a mention sends a picture, and queues nothing when the DM declines", async () => {
    const render = useAskSceneRender();
    mocks.ack.mockResolvedValue(false);
    expect(await render.start({ concept: "@Aria", entities: [{ label: "Aria", portraitUrl: "a.webp" } as never], size: "1024x1024", noteId: null })).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    mocks.ack.mockClear();
    expect(await render.start({ concept: "a keep", entities: [{ label: "Aria" } as never], size: "1024x1024", noteId: "n1" })).toEqual({ jobId: "j1" });
    expect(mocks.ack).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith({ sceneText: "a keep", entities: [{ label: "Aria" }], size: "1024x1024", noteId: "n1" });
  });
});
