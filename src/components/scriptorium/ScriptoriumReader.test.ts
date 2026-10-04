import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { computed, ref } from "vue";
import ScriptoriumReader from "./ScriptoriumReader.vue";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

/** Tiptap's core Editor fires "create" (and <EditorContent>'s first DOM
 *  render) from a `window.setTimeout(…, 0)` inside mount() — see
 *  ScriptoriumDocumentView.test.ts's identical flushEditor. */
function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), embedHtml: { value: null as string | null } }));
vi.mock("@/composables/scriptorium/usePlayerEntityEmbed", () => ({
  usePlayerEntityEmbed: () => ({ html: computed(() => mocks.embedHtml.value), isLoading: computed(() => false) }),
}));
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
    player_visible_to: [],
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
    { type: "heading", attrs: { level: 2, blockId: "h2" }, content: [{ type: "text", text: "The Flooded Nave" }] },
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

  it("shows no contents list for a handout with a single heading", async () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, blockId: "h1" }, content: [{ type: "text", text: "WANTED" }] },
        { type: "paragraph", content: [{ type: "text", text: "A reward of 200 gp." }] },
      ],
    });
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc({ content }) } });
    await flushEditor();
    expect(wrapper.text()).not.toContain("Contents");
  });

  it("names the document a Handout, not by its doc type, for a player", () => {
    const wrapper = mount(ScriptoriumReader, {
      props: { document: makeDoc({ campaign_id: "camp-1", player_visible_to: ["member-1"] }), audience: "player" },
    });
    expect(wrapper.find("header").text()).toContain("Handout");
  });

  it("shows the unreadable-content state, with no TOC, for invalid content", () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc({ content: "not json" }) } });
    expect(wrapper.text()).toContain("This document could not be read");
    expect(wrapper.text()).not.toContain("Contents");
  });

  it("falls back to backTo, and renders the actions slot in the header", async () => {
    const wrapper = mount(ScriptoriumReader, {
      props: { document: makeDoc(), backTo: "/play/journal" },
      slots: { actions: '<button data-test="give">Give to players</button>' },
    });
    expect(wrapper.find("header [data-test='give']").exists()).toBe(true);
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    await wrapper.get('button[aria-label="Back to Scriptorium"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/play/journal");
  });

  it("passes the audience through to ScriptoriumDocumentView", () => {
    const wrapper = mount(ScriptoriumReader, { props: { document: makeDoc({ campaign_id: "camp-1", player_visible_to: ["member-1"] }), audience: "player" } });
    expect(wrapper.findComponent({ name: "ScriptoriumDocumentView" }).props("audience")).toBe("player");
  });

  it("lists no contents entry for an embed a player cannot see, and one for an embed they can", async () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, blockId: "h1" }, content: [{ type: "text", text: "Chapter One" }] },
        { type: "heading", attrs: { level: 1, blockId: "h2" }, content: [{ type: "text", text: "Chapter Two" }] },
        { type: "entityEmbed", attrs: { entityType: "monster", entityId: "srd_owlbear", blockId: "e1" } },
      ],
    });
    const props = { document: makeDoc({ content, campaign_id: "camp-1", player_visible_to: ["member-1"] }), audience: "player" as const };

    mocks.embedHtml.value = null;
    const hidden = mount(ScriptoriumReader, { props });
    await flushEditor();
    expect(hidden.findAll("button").some((b) => b.text() === "Chapter One")).toBe(true);
    expect(hidden.findAll("button").some((b) => b.text() === "Owlbear")).toBe(false);

    mocks.embedHtml.value = '<div class="sc-statblock-entry"><h2 class="sc-statblock-entry-heading">Owlbear</h2></div>';
    const shown = mount(ScriptoriumReader, { props });
    await flushEditor();
    await flushEditor();
    expect(shown.findAll("button").some((b) => b.text() === "Owlbear")).toBe(true);
  });
});
