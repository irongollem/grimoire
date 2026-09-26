import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import ScriptoriumReader from "./ScriptoriumReader.vue";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

/** Tiptap's core Editor fires "create" (and <EditorContent>'s first DOM
 *  render) from a `window.setTimeout(…, 0)` inside mount() — see
 *  ScriptoriumDocumentView.test.ts's identical flushEditor. */
function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: ref(null), activeCampaign: ref(null) }),
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useAllDmCampaigns: () => ({ data: ref([]) }),
}));

function makeDoc(overrides: Partial<ScriptoriumDocument> = {}): ScriptoriumDocument {
  return {
    id: "doc-1",
    user_id: "user-1",
    title: "The Sunken Temple",
    content: null,
    doc_type: "adventure",
    campaign_id: null,
    tags: [],
    is_published: false,
    is_two_column: false,
    theme: "onednd2024",
    page_size: "A4",
    ink_friendly: false,
    word_count: 1,
    show_page_numbers: false,
    footer_text: "",
    page_number_start: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** One of each shape the reader has to adapt: a cover, an (empty) TOC
 *  placeholder, a heading, a read-aloud box, an image and a table. */
const RICH_CONTENT = JSON.stringify({
  type: "doc",
  content: [
    { type: "coverPage", attrs: { variant: "front", title: "The Sunken Temple", subtitle: "A one-shot" } },
    { type: "tocBlock" },
    { type: "heading", attrs: { level: 1, blockId: "h1" }, content: [{ type: "text", text: "Chapter One" }] },
    {
      type: "descriptiveBlock",
      content: [{ type: "paragraph", content: [{ type: "text", text: "The air is damp and cold." }] }],
    },
    { type: "image", attrs: { src: "https://example.com/art.png", alt: "", width: "200", layoutMode: "inline" } },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }] },
          ],
        },
      ],
    },
  ],
});

beforeEach(() => {
  mocks.back.mockClear();
  mocks.push.mockClear();
  // jsdom has no scrollIntoView — stub it so revealInScrollParent's own guard
  // (typeof el.scrollIntoView !== "function") doesn't just no-op every call.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ScriptoriumReader", () => {
  it("shows a compact header with the title, doc type and scope", () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc() } });
    expect(wrapper.text()).toContain("The Sunken Temple");
    expect(wrapper.text()).toContain("Adventure");
    expect(wrapper.text()).toContain("General");
  });

  it("goes back through history when there is one, else to the Scriptorium list", async () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc() } });
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    await wrapper.get('button[aria-label="Back to Scriptorium"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium");
  });

  it("passes layout=\"reader\" through to ScriptoriumDocumentView", () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc() } });
    expect(wrapper.findComponent({ name: "ScriptoriumDocumentView" }).props("layout")).toBe("reader");
  });

  it("renders a cover, a read-aloud box, a table and an image, and a tappable TOC that scrolls to a heading", async () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc({ content: RICH_CONTENT }) } });
    await flushEditor();

    expect(wrapper.find('div[data-type="coverPage"]').exists()).toBe(true);
    expect(wrapper.find(".sc-descriptive").exists()).toBe(true);
    expect(wrapper.find(".tableWrapper table").exists()).toBe(true);
    expect(wrapper.find("img[data-layout-mode]").exists()).toBe(true);

    // The tappable TOC list is built independently of the (empty) tocBlock
    // placeholder node — see reader/readerToc.ts.
    expect(wrapper.text()).toContain("Contents");
    const entry = wrapper.findAll("button").find((b) => b.text() === "Chapter One");
    expect(entry).toBeTruthy();
    await entry!.trigger("click");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("shows the unreadable-content state, with no TOC, for invalid content", () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc({ content: "not json" }) } });
    expect(wrapper.text()).toContain("This document could not be read");
    expect(wrapper.text()).not.toContain("Contents");
  });
});
