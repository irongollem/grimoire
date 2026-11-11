// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumChapterEditor from "./ScriptoriumChapterEditor.vue";
import type { ScriptoriumChapter } from "@/scriptorium/types";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/scriptorium/composables/useScriptoriumChapters", () => ({
  useSaveChapter: () => ({ mutateAsync: mocks.save }),
}));
vi.mock("@/composables/useImageUpload", () => ({
  cleanupRemovedRichTextImages: (...args: unknown[]) => mocks.cleanup(...args),
}));
vi.mock("@/scriptorium/composables/useScriptoriumIlluminator", async () => {
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

function open(extra: Record<string, unknown> = {}, body: ScriptoriumChapter = chapter) {
  const wrapper = mount(ScriptoriumChapterEditor, {
    props: { ...extra, chapter: body, documentId: "d1", theme: "onednd2024", docType: "custom", pageSize: "A4", isTwoColumn: false, inkFriendly: false, furniture: [], selectedFurnitureId: null, pageContext: { paperLabel: "", chapterNumber: 1, chapterTitle: "", isHandout: false, firstPageLabel: null, bookPageCount: null } },
    global: {
      stubs: {
        ScriptoriumEditorToolbar: true,
        AssetInsertPanel: true,
        BlockPickerPanel: true,
        ArtPickerModal: true,
        ScriptoriumPanel: true,
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

describe("ScriptoriumChapterEditor's panel", () => {
  const withPicture: ScriptoriumChapter = {
    ...chapter,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "One" }] },
        { type: "image", attrs: { src: "p.webp", width: "330" } },
      ],
    },
  };
  type PanelExposed = { editor: { commands: { setNodeSelection: (pos: number) => void; setTextSelection: (pos: number) => void } } };
  const aside = (w: ReturnType<typeof open>) => w.find("[data-testid=panel-aside]");

  // Fails on: the two-column warning's "Place it on the page instead" doing nothing, so the contract between the two stories is dead.
  it("places a picture on the page when the text asks by event, and takes it out of the text", async () => {
    const wrapper = open({}, withPicture);
    await flushPromises();
    wrapper.element.dispatchEvent(new CustomEvent("sc-place-on-page", { bubbles: true, detail: { pos: 5 } }));
    const placed = wrapper.emitted("update:furniture")?.at(-1)?.[0] as { kind: string; props: { src: string } }[];
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: "art", z: "over", props: { src: "p.webp" } });
    expect(wrapper.emitted("update:selectedFurnitureId")?.at(-1)?.[0]).toBe((placed[0] as unknown as { id: string }).id);
    expect(JSON.stringify((wrapper.vm as unknown as { editor: { getJSON: () => unknown } }).editor.getJSON())).not.toContain("p.webp");
  });

  it("ignores an event that names no picture", async () => {
    const wrapper = open({}, withPicture);
    await flushPromises();
    wrapper.element.dispatchEvent(new CustomEvent("sc-place-on-page", { bubbles: true, detail: {} }));
    expect(wrapper.emitted("update:furniture")).toBeUndefined();
  });

  // Fails on: the panel covering the page's text column on a narrow screen: it must stay shut until something is selected.
  it("on a narrow screen opens for a selection, closes on its close button, and reopens for the next one", async () => {
    const wrapper = open({}, withPicture);
    await flushPromises();
    const ed = (wrapper.vm as unknown as PanelExposed).editor;
    expect(aside(wrapper).classes()).toContain("w-0");
    expect(aside(wrapper).attributes("inert")).toBeDefined();
    ed.commands.setNodeSelection(5);
    await nextTick();
    expect(aside(wrapper).classes()).toContain("w-80");
    expect(aside(wrapper).attributes("inert")).toBeUndefined();
    wrapper.findComponent({ name: "ScriptoriumPanel" }).vm.$emit("close");
    await nextTick();
    expect(aside(wrapper).classes()).toContain("w-0");
    // Back into the text, then the same picture again: it opens again.
    ed.commands.setTextSelection(2);
    await nextTick();
    ed.commands.setNodeSelection(5);
    await nextTick();
    expect(aside(wrapper).classes()).toContain("w-80");
  });

  it("closes when the writer clicks back into the text", async () => {
    const wrapper = open({}, withPicture);
    await flushPromises();
    const ed = (wrapper.vm as unknown as PanelExposed).editor;
    ed.commands.setNodeSelection(5);
    await nextTick();
    ed.commands.setTextSelection(2);
    await nextTick();
    expect(aside(wrapper).classes()).toContain("w-0");
  });

  // Fails on: Focus leaving the panel on screen.
  it("Focus hides the panel", async () => {
    const wrapper = open({ panelHidden: true }, withPicture);
    await flushPromises();
    expect(aside(wrapper).exists()).toBe(false);
  });
});
