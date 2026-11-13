// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import ScriptoriumPanel from "./ScriptoriumPanel.vue";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { FOOTER_SETTINGS_KEY } from "@/scriptorium/lib/footerTitle";
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

// The quota, the upload and the opening are usePagePainting's own tests; here the button reaches it.
const painting = vi.hoisted(() => ({ start: vi.fn(), options: null as null | { open: (item: unknown) => void } }));
vi.mock("@/scriptorium/composables/usePagePainting", async () => {
  const { ref } = await import("vue");
  return {
    usePagePainting: (options: { open: (item: unknown) => void }) => {
      painting.options = options;
      return { start: painting.start, busy: ref(false), showPaywall: ref(false) };
    },
  };
});

const campaign = vi.hoisted(() => ({ activeCampaignId: "camp-1" as string | null, isAiEnabled: true }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));

const footerSettings = {
  draft: { showPageNumbers: true, pageNumberStart: 1, footerText: "", footerTitle: "chapter" as const },
  patch: vi.fn(),
};
const DialogStub = {
  props: { shapes: Array, closeOnStart: Boolean, visible: Boolean, title: String },
  emits: ["close", "started"],
  template: '<div data-testid="describe-dialog" />',
};
const stubs = { ChroniclerGenerateDialog: DialogStub, NewSheetDialog: true, PaywallModal: true, ArtPickerModal: true, ImageUpload: true, EmbedRevealControl: true, AiImageBadge: true };
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
  campaign.activeCampaignId = "camp-1";
  campaign.isAiEnabled = true;
});

function makePictures(): PictureActions {
  return {
    placeOnPage: vi.fn(),
    putInText: vi.fn(),
    replaceSrc: vi.fn(),
    remove: vi.fn(),
    chooseCorner: vi.fn(),
    chooseAnchor: vi.fn(),
    valuesOf: () => null,
    nodePosByBlockId: () => null,
    treat: vi.fn(),
    pageOfPicture: () => null,
    anchorState: () => ({ page: 2, hasParagraph: true, canFree: true }),
    pageOf: () => 2,
    addArt: vi.fn(),
    keyOf: () => null,
    targetOf: () => null,
    markPending: vi.fn(),
    pendingPictures: () => [],
  };
}

function open(selection: PanelSelection, content: object[], furniture: PageFurnitureItem[] = [], extra: Record<string, unknown> = {}) {
  const ed = new Editor({ element: document.createElement("div"), content: { type: "doc", content }, extensions: [...createScriptoriumExtensions(), PageFlow] });
  editor = ed;
  const pictures = makePictures();
  const wrapper = mount(ScriptoriumPanel, {
    props: { selection, editor: ed, version: 0, chapterId: "c1", furniture, pictures, context, canEditPicture: true, closable: false, ...extra },
    global: { stubs, provide: { [FOOTER_SETTINGS_KEY as symbol]: footerSettings } },
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

  // Fails on: a blank sheet added without its recipe (so it opens as a plain picture), or the Illuminator not opening on the Brush.
  it("a blank sheet goes on the page with its recipe, and the Illuminator opens on the Brush", async () => {
    const { wrapper, pictures } = open({ kind: "page", page: 1 }, [para("b1")]);
    await press(wrapper, "Blank sheet");
    const dialog = wrapper.findComponent({ name: "NewSheetDialog" });
    const recipe = { v: 1 as const, seed: 3, steps: [{ type: "paint" as const, width: 10, height: 20, paper: "kraft", layers: [] }] };
    // The selection prop stays on the page: it has not caught up with the new art, as in the shell.
    const created = { id: "new-art", kind: "art", props: { src: "https://cdn/s.webp" } } as unknown as PageFurnitureItem;
    vi.mocked(pictures.addArt).mockReturnValue(created);
    dialog.vm.$emit("created", { url: "https://cdn/s.webp", recipe });
    await flushPromises();
    expect(pictures.addArt).toHaveBeenCalledWith("https://cdn/s.webp", expect.objectContaining({ original: "https://cdn/s.webp", illuminate: recipe }));
    expect(wrapper.emitted("editPicture")).toEqual([["brush", created]]);
  });

  // Fails on: Paint on this page doing nothing, or the new painting opening the Illuminator on the wrong tool.
  it("Paint on this page starts a painting, and the Illuminator opens on it with the Brush", async () => {
    const { wrapper } = open({ kind: "page", page: 1 }, [para("b1")]);
    await press(wrapper, "Paint on this page");
    expect(painting.start).toHaveBeenCalledTimes(1);
    const created = { id: "new-art", kind: "art", props: { src: "p.webp" } };
    painting.options?.open(created);
    expect(wrapper.emitted("editPicture")).toEqual([["brush", created]]);
  });

  // Fails on: a cover edit that does not reach the cover node, or one that goes to whatever the cursor is in.
  it("writes a cover control into the cover node, live", async () => {
    const { wrapper, ed } = open({ kind: "cover", pos: 0 }, [{ type: "coverPage", attrs: { variant: "front" } }, para("b1")]);
    await press(wrapper, "Top");
    expect(ed.getJSON().content?.[0]?.attrs).toMatchObject({ variant: "front", titlePlace: "top" });
  });

  // Fails on: a divider's style control not reaching the divider node, or going to the paragraph the caret is in.
  it("writes the divider style into the selected divider", async () => {
    const { wrapper, ed } = open({ kind: "divider", pos: 0 }, [{ type: "divider", attrs: { variant: "flourish" } }, para("b1")]);
    expect(wrapper.find("[data-testid=panel-divider]").exists()).toBe(true);
    await press(wrapper, "Stars");
    expect(ed.getJSON().content?.[0]?.attrs).toMatchObject({ variant: "stars" });
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
  // Fails on: the contents page or a footer falling through to the page section, so the panel describes the wrong thing.
  it("shows the contents section for the contents page and the footer section for a footer", () => {
    const contents = open({ kind: "contents", pos: 5 }, [para("b1"), { type: "tocBlock" }]);
    expect(contents.wrapper.find('[data-testid="panel-contents"]').exists()).toBe(true);
    expect(contents.wrapper.find('[data-testid="panel-page"]').exists()).toBe(false);
    const footer = open({ kind: "footer", page: 15 }, [para("b1")]);
    expect(footer.wrapper.find('[data-testid="panel-footer"]').exists()).toBe(true);
    expect(footer.wrapper.find('[data-testid="panel-page"]').exists()).toBe(false);
  });

  it("asks a linked entry to detach where it is drawn", async () => {
    const { wrapper, ed } = open({ kind: "embed", pos: 5 }, [para("b1"), { type: "entityEmbed", attrs: { entityType: "monster", entityId: "e1" } }]);
    await press(wrapper, "Detach…");
    expect(mocks.signal).toHaveBeenCalledWith(ed, 5, "sc-embed-detach");
  });

  it("changes a linked entry's options on the entry itself", async () => {
    const { wrapper, ed } = open({ kind: "embed", pos: 5 }, [para("b1"), { type: "entityEmbed", attrs: { entityType: "monster", entityId: "e1", showLore: true } }]);
    await press(wrapper, "Full width");
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

  // Fails on: the footer's page-only choices writing nothing (or to the wrong page), so a footer clicked on page 2 changes page 1.
  it("a footer's page-only choices write the marker on that footer's own page, and read it back", async () => {
    const { wrapper, ed } = open({ kind: "footer", page: 2 }, [para("b1"), para("b2")]);
    const pageFlow = (ed.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow;
    const second = ed.state.doc.child(0).nodeSize;
    pageFlow.pages = [
      { page: 1, startPos: 0, contentTop: 0, contentHeight: 900 },
      { page: 2, startPos: second, contentTop: 900, contentHeight: 900 },
    ];
    await wrapper.setProps({ version: 1 });
    const box = wrapper.findAll("label").find((l) => l.text().startsWith("No footer on page"));
    await box?.find("input").setValue(true);
    const kinds = (ed.getJSON().content ?? []).map((n) => n.type);
    expect(kinds).toEqual(["paragraph", "skipCounting", "paragraph"]);
    await wrapper.setProps({ version: 2 });
    const again = wrapper.findAll("label").find((l) => l.text().startsWith("No footer on page"));
    expect(again?.find<HTMLInputElement>("input").element.checked).toBe(true);
  });

  it("the book-wide choices go to the book's settings", async () => {
    footerSettings.patch.mockReset();
    const { wrapper } = open({ kind: "footer", page: 1 }, [para("b1")]);
    await press(wrapper, "Book");
    expect(footerSettings.patch).toHaveBeenCalledWith({ footerTitle: "book" });
  });

  const table = (cls?: string) => ({
    type: "table",
    attrs: cls ? { class: cls } : {},
    content: [{ type: "tableRow", content: [{ type: "tableCell", content: [para("c1")] }] }],
  });

  // Fails on: Striped / Plain / The look's not reaching the table, or wiping the other classes print put on it.
  it("sets a table's rows from the panel and keeps its other classes", async () => {
    const { wrapper, ed } = open({ kind: "block", pos: 0 }, [table("sc-table--long")]);
    await press(wrapper, "Striped");
    expect(ed.getJSON().content?.[0]?.attrs?.class).toBe("sc-table--long sc-table--striped");
    await wrapper.setProps({ version: 1 });
    await press(wrapper, "Plain");
    expect(ed.getJSON().content?.[0]?.attrs?.class).toBe("sc-table--long sc-table--plain");
    await wrapper.setProps({ version: 2 });
    await press(wrapper, "The look's");
    expect(ed.getJSON().content?.[0]?.attrs?.class).toBe("sc-table--long");
  });

  // Fails on: the Rows control showing for a read-aloud box, where there are no rows.
  it("offers Rows for a table only", () => {
    const { wrapper } = open({ kind: "block", pos: 0 }, [{ type: "descriptiveBlock", content: [para("b1")] }]);
    expect(wrapper.text()).not.toContain("Striped");
  });

  describe("Describe it", () => {
    const picture = { kind: "picture", source: "node", pos: 5 } as const;
    const content = () => [para("b1"), { type: "image", attrs: { src: "p.webp" } }];
    const hasDescribe = (w: ReturnType<typeof mount>) => w.find("[data-testid=panel-describe]").exists();

    // Fails on: offering an AI action in a book of a campaign that is not the one open, or with AI off.
    it("is offered only for the active campaign with AI on", () => {
      expect(hasDescribe(open(picture, content(), [], { campaignId: "camp-1" }).wrapper)).toBe(true);
      expect(hasDescribe(open(picture, content(), [], { campaignId: "camp-2" }).wrapper)).toBe(false);
      expect(hasDescribe(open(picture, content()).wrapper)).toBe(false);
      campaign.isAiEnabled = false;
      expect(hasDescribe(open(picture, content(), [], { campaignId: "camp-1" }).wrapper)).toBe(false);
    });

    // Fails on: the dialog offering the notes' two shapes, or the result being reported for no picture.
    it("opens the dialog with the book's six shapes and reports the render for the picture that was selected", async () => {
      const { wrapper } = open(picture, content(), [], { campaignId: "camp-1", pageAspect: 1 / 1.414 });
      expect(wrapper.find("[data-testid=describe-dialog]").exists()).toBe(false);
      await wrapper.find("[data-testid=panel-describe]").trigger("click");
      const dialog = wrapper.findComponent(DialogStub);
      expect((dialog.props("shapes") as { id: string }[]).map((s) => s.id)).toEqual(["page", "tall", "square", "landscape", "banner", "column"]);
      expect(dialog.props("closeOnStart")).toBe(true);
      await dialog.vm.$emit("started", { jobId: "j1", prompt: "a keep", size: "1536x1024", shape: "banner" });
      expect(wrapper.emitted("describe")).toEqual([[{ source: "node", pos: 5 }, { jobId: "j1", shape: "banner" }]]);
      await dialog.vm.$emit("close");
      expect(wrapper.find("[data-testid=describe-dialog]").exists()).toBe(false);
    });

    // Fails on: a second paint being started on a picture that is already being painted.
    it("shows a picture that is painting as busy and not clickable", () => {
      const painting = [para("b1"), { type: "image", attrs: { src: "p.webp", pendingJob: "j1", pendingShape: "tall" } }];
      const { wrapper } = open(picture, painting, [], { campaignId: "camp-1" });
      const button = wrapper.find("[data-testid=panel-describe]");
      expect(button.text()).toContain("Painting");
      expect(button.attributes("disabled")).toBeDefined();
    });
  });
});
