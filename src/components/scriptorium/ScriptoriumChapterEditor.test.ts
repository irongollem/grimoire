// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumChapterEditor from "./ScriptoriumChapterEditor.vue";
import type { ScriptoriumChapter } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/composables/scriptorium/useScriptoriumChapters", () => ({
  useSaveChapter: () => ({ mutateAsync: mocks.save }),
}));
vi.mock("@/composables/useImageUpload", () => ({
  cleanupRemovedRichTextImages: (...args: unknown[]) => mocks.cleanup(...args),
}));
vi.mock("@/composables/scriptorium/useScriptoriumIlluminator", async () => {
  const { ref } = await import("vue");
  return { useScriptoriumIlluminator: () => ({ selectedImageIsSupabase: ref(false), editInIlluminator: vi.fn() }) };
});
vi.mock("@/ai/useTextEnhancement", async () => {
  const { ref } = await import("vue");
  return { useEnhanceAvailable: () => ref(false) };
});

const chapter: ScriptoriumChapter = {
  id: "c1",
  document_id: "d1",
  position: 0,
  title: "One",
  content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "One" }] }] },
  word_count: 1,
  created_at: "",
  updated_at: "2026-10-29T10:00:00Z",
};

function open() {
  const wrapper = mount(ScriptoriumChapterEditor, {
    props: { chapter, documentId: "d1", theme: "onednd2024", docType: "custom", isTwoColumn: false, inkFriendly: false },
    global: {
      stubs: {
        ScriptoriumEditorToolbar: true,
        AssetInsertPanel: true,
        BlockPickerPanel: true,
        ArtPickerModal: true,
        CoverPageInspector: true,
        TextEnhanceBubble: true,
      },
    },
  });
  return wrapper;
}

type Exposed = { editor: { commands: { insertContent: (c: string) => void }; getJSON: () => unknown }; saveNow: () => Promise<void>; hold: () => Promise<void>; dirty: boolean };

async function typeInto(wrapper: ReturnType<typeof open>) {
  await flushPromises();
  const exposed = wrapper.vm as unknown as Exposed;
  exposed.editor.commands.insertContent("more words");
  await flushPromises();
  return exposed;
}

beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(chapter);
  mocks.cleanup.mockReset();
});

describe("ScriptoriumChapterEditor", () => {
  it("saves the typed text to its own chapter on saveNow", async () => {
    const exposed = await typeInto(open());
    await exposed.saveNow();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.save.mock.calls[0]![0].content)).toContain("more words");
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ id: "c1", documentId: "d1" });
  });

  it("keeps the edit and reports the error when a save fails, then sends it on the next try", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    const wrapper = open();
    const exposed = await typeInto(wrapper);
    await exposed.saveNow();
    expect(exposed.dirty).toBe(true);
    const states = wrapper.emitted("status")!;
    expect(states.at(-1)![0]).toMatchObject({ status: "error", error: "offline" });
    await exposed.saveNow();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(exposed.dirty).toBe(false);
  });

  it("writes nothing once held, so a pending save cannot hit a chapter that was deleted", async () => {
    const exposed = await typeInto(open());
    await exposed.hold();
    await exposed.saveNow();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("deletes the images an edit removed from this chapter, once the save landed", async () => {
    const exposed = await typeInto(open());
    await exposed.saveNow();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup.mock.calls[0]![0]).toContain('"One"');
  });

  it("does not clean images when the save failed", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    const exposed = await typeInto(open());
    await exposed.saveNow();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
