// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import ScriptoriumPanel from "./ScriptoriumPanel.vue";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import type { PictureActions } from "@/scriptorium/composables/useEditorPictures";
import type { PanelSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import type { PanelPageContext } from "@/scriptorium/lib/panel/pageInfo";
import type { PageFurnitureItem } from "@/scriptorium/types";

const mocks = vi.hoisted(() => ({ signal: vi.fn() }));
vi.mock("@/scriptorium/lib/panel/embedSignals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/lib/panel/embedSignals")>()),
  signalEmbed: mocks.signal,
}));

const stubs = { ArtPickerModal: true, ImageUpload: true, EmbedRevealControl: true };
const context: PanelPageContext = {
  paperLabel: "Grimoire · A4 · Two columns",
  chapterNumber: 3,
  chapterTitle: "The Understage",
  isHandout: false,
  firstPageLabel: "14",
  bookPageCount: 28,
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  mocks.signal.mockReset();
});

function makePictures(): PictureActions {
  return {
    placeOnPage: vi.fn(),
    putInText: vi.fn(),
    replaceSrc: vi.fn(),
    remove: vi.fn(),
    chooseCorner: vi.fn(),
    chooseAnchor: vi.fn(),
    anchorState: () => ({ page: 2, hasParagraph: true, canFree: true }),
    pageOf: () => 2,
    addArt: vi.fn(),
  };
}

function open(selection: PanelSelection, content: object[], furniture: PageFurnitureItem[] = []) {
  const ed = new Editor({ element: document.createElement("div"), content: { type: "doc", content }, extensions: [...createScriptoriumExtensions(), PageFlow] });
  editor = ed;
  const pictures = makePictures();
  const wrapper = mount(ScriptoriumPanel, {
    props: { selection, editor: ed, version: 0, chapterId: "c1", furniture, pictures, context, canEditNodePicture: true, closable: false },
    global: { stubs },
  });
  return { ed, pictures, wrapper };
}

const para = (id: string) => ({ type: "paragraph", attrs: { blockId: id }, content: [{ type: "text", text: "One" }] });
function press(w: ReturnType<typeof mount>, text: string) {
  const b = w.findAll("button").find((x) => x.text() === text);
  if (!b) throw new Error(`no button "${text}"`);
  return b.trigger("click");
}

describe("ScriptoriumPanel", () => {
  // Fails on: the panel going blank, or stuck on a stale selection, when nothing is selected.
  it("the panel describes the page when nothing is selected", async () => {
    const { wrapper } = open({ kind: "page", page: 3 }, [para("b1")]);
    expect(wrapper.find("[data-testid=panel-page]").exists()).toBe(true);
    expect(wrapper.find("[data-testid=panel-page-number]").text()).toBe("16");
    expect(wrapper.text()).toContain("of 28");
    expect(wrapper.text()).toContain("Grimoire · A4 · Two columns");
    await press(wrapper, "Book settings");
    expect(wrapper.emitted("openSettings")).toHaveLength(1);
  });

  it("adds a watermark or opens the art picker from Add to this page", async () => {
    const { wrapper } = open({ kind: "page", page: 1 }, [para("b1")]);
    await press(wrapper, "Watermark");
    expect(wrapper.emitted("addFurniture")).toEqual([["watermark"]]);
  });

  // Fails on: a cover edit that does not reach the cover node, or one that goes to whatever the cursor is in.
  it("writes a cover's title into the cover node, live", async () => {
    const { wrapper, ed } = open({ kind: "cover", pos: 0 }, [{ type: "coverPage", attrs: { variant: "front", title: "" } }, para("b1")]);
    await wrapper.find('input[placeholder="Document Title"]').setValue("The Understage");
    expect(ed.getJSON().content?.[0]?.attrs).toMatchObject({ variant: "front", title: "The Understage" });
  });

  // Fails on: Layer doing nothing, or placing the picture in front when Behind was chosen.
  it("moves a picture in the text onto the page at the layer picked", async () => {
    const { wrapper, pictures } = open({ kind: "picture", source: "node", pos: 5 }, [para("b1"), { type: "image", attrs: { src: "p.webp" } }]);
    expect(wrapper.find("[data-testid=panel-picture-where]").text()).toBe("In the text");
    await press(wrapper, "Behind the text");
    expect(pictures.placeOnPage).toHaveBeenCalledWith(5, "under");
  });

  it("moves placed art back into the text, or between behind and in front", async () => {
    const art: PageFurnitureItem = { id: "f1", kind: "art", anchor: { type: "block", blockId: "b1" }, x: 0, y: 0, width: 40, z: "over", props: { src: "a.webp" } };
    const { wrapper, pictures } = open({ kind: "picture", source: "furniture", id: "f1" }, [para("b1")], [art]);
    expect(wrapper.find("[data-testid=panel-picture-where]").text()).toBe("Placed on page 15");
    await press(wrapper, "In the text");
    expect(pictures.putInText).toHaveBeenCalledWith("f1");
    await press(wrapper, "Behind the text");
    expect(wrapper.emitted("updateItem")?.at(-1)).toEqual([{ ...art, z: "under" }]);
  });

  // Fails on: Edit picture being offered for art on the page, which has no Illuminator route yet.
  it("keeps Edit picture off for art on the page and on for a library picture in the text", () => {
    const art: PageFurnitureItem = { id: "f1", kind: "art", anchor: { type: "block", blockId: "b1" }, x: 0, y: 0, width: 40, z: "over", props: { src: "a.webp" } };
    const onPage = open({ kind: "picture", source: "furniture", id: "f1" }, [para("b1")], [art]);
    expect(onPage.wrapper.findAll("button").find((b) => b.text() === "Edit picture…")?.attributes("disabled")).toBeDefined();
    const inText = open({ kind: "picture", source: "node", pos: 5 }, [para("b1"), { type: "image", attrs: { src: "p.webp" } }]);
    expect(inText.wrapper.findAll("button").find((b) => b.text() === "Edit picture…")?.attributes("disabled")).toBeUndefined();
  });

  it("asks a linked entry to detach where it is drawn", async () => {
    const { wrapper, ed } = open({ kind: "embed", pos: 5 }, [para("b1"), { type: "entityEmbed", attrs: { entityType: "monster", entityId: "e1" } }]);
    await press(wrapper, "Detach…");
    expect(mocks.signal).toHaveBeenCalledWith(ed, 5, "sc-embed-detach");
  });

  it("changes a linked entry's options on the entry itself", async () => {
    const { wrapper, ed } = open({ kind: "embed", pos: 5 }, [para("b1"), { type: "entityEmbed", attrs: { entityType: "monster", entityId: "e1", showLore: true } }]);
    await press(wrapper, "Wide");
    expect(ed.getJSON().content?.[1]?.attrs).toMatchObject({ size: "wide" });
  });

  it("lists what is on the page and selects a decoration from its row", async () => {
    const mark: PageFurnitureItem = { id: "w1", kind: "watermark", anchor: { type: "block", blockId: "b1" }, x: 0, y: 0, width: 100, z: "under", props: { text: "DRAFT" } };
    const { wrapper, ed } = open({ kind: "page", page: 1 }, [para("b1")], [mark]);
    (ed.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow.pages = [{ page: 1, startPos: 0, contentTop: 0, contentHeight: 900 }];
    await wrapper.setProps({ version: 1 });
    await press(wrapper, "Watermark");
    expect(wrapper.emitted("selectFurniture")).toEqual([["w1"]]);
  });
});
