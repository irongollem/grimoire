import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { computed, ref } from "vue";
import ScriptoriumReader from "./ScriptoriumReader.vue";
import type { JSONContent } from "@tiptap/core";
import type { ReadableBook } from "@/types/scriptorium.types";

/** Tiptap's core Editor fires "create" (and <EditorContent>'s first DOM
 *  render) from a `window.setTimeout(…, 0)` inside mount() — see
 *  ScriptoriumDocumentView.test.ts's identical flushEditor. */
function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  embedHtml: { value: null as string | null },
  dmCampaigns: vi.fn(),
  activeId: { value: null as string | null },
  activeName: { value: null as string | null },
}));
vi.mock("@/composables/scriptorium/usePlayerEntityEmbed", () => ({
  usePlayerEntityEmbed: () => ({ html: computed(() => mocks.embedHtml.value), isLoading: computed(() => false) }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: ref(mocks.activeId.value),
    activeCampaign: ref(mocks.activeName.value ? { id: mocks.activeId.value, name: mocks.activeName.value } : null),
  }),
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useAllDmCampaigns: (options: unknown) => {
    mocks.dmCampaigns(options);
    return { data: ref([{ id: "camp-other", name: "Curse of Strahd" }]) };
  },
}));

function makeBook(overrides: Partial<ReadableBook> = {}): ReadableBook {
  return {
    id: "doc-1",
    title: "The Sunken Temple",
    kind: "book",
    doc_type: "adventure",
    campaign_id: null,
    theme: "onednd2024",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const para = (t: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const chapterOf = (id: string, title: string, body = `${title} body`) => ({
  id,
  title,
  content: { type: "doc", content: [para(body)] } as JSONContent,
});
const CHAPTERS = [
  { id: "c1", title: "Welcome" },
  { id: "c2", title: "Peoples" },
  { id: "c3", title: "" },
];

/** One of each shape the reader has to adapt: a cover, a heading, a read-aloud box, an image and a table. */
const RICH_CONTENT: JSONContent = {
  type: "doc",
  content: [
    { type: "coverPage", attrs: { variant: "front", title: "The Sunken Temple", subtitle: "A one-shot" } },
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
};

beforeEach(() => {
  mocks.dmCampaigns.mockClear();
  mocks.activeId.value = null;
  mocks.activeName.value = null;
  mocks.back.mockClear();
  mocks.push.mockClear();
  // jsdom has no scrollIntoView — stub it so revealInScrollParent's own guard
  // (typeof el.scrollIntoView !== "function") doesn't just no-op every call.
  Element.prototype.scrollIntoView = vi.fn();
});

function mountReader(props: Record<string, unknown> = {}, slots?: Record<string, string>) {
  return mount(ScriptoriumReader, {
    props: { book: makeBook(), chapters: [CHAPTERS[0]], chapter: chapterOf("c1", "Welcome"), ...props },
    slots,
  });
}

describe("ScriptoriumReader", () => {
  it("shows a compact header with the title, doc type and scope", () => {
    const wrapper = mountReader();
    expect(wrapper.text()).toContain("The Sunken Temple");
    expect(wrapper.text()).toContain("Adventure");
    expect(wrapper.text()).toContain("General");
  });

  it("goes back through history when there is one, else to the Scriptorium list", async () => {
    const wrapper = mountReader();
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    await wrapper.get('button[aria-label="Back to Scriptorium"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium");
  });

  it("passes layout=\"reader\" through to ScriptoriumDocumentView", () => {
    expect(mountReader().findComponent({ name: "ScriptoriumDocumentView" }).props("layout")).toBe("reader");
  });

  it("with one chapter shows its page at once, with no contents list", async () => {
    const wrapper = mountReader({ chapter: chapterOf("c1", "Welcome", "Dear friends") });
    await flushEditor();
    expect(wrapper.text()).toContain("Dear friends");
    expect(wrapper.find('nav[aria-label="Chapters"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Contents");
  });

  it("with one chapter asks the parent for it, so a handout needs no special case", () => {
    const wrapper = mountReader({ chapter: null });
    expect(wrapper.emitted("selectChapter")).toEqual([["c1"]]);
  });

  it("opens a book on its chapters, with an unnamed chapter called Untitled", () => {
    const wrapper = mountReader({ chapters: CHAPTERS, chapter: chapterOf("c1", "Welcome") });
    const rows = wrapper.findAll('nav[aria-label="Chapters"] button').map((b) => b.text());
    expect(rows).toEqual(["Welcome", "Peoples", "Untitled chapter"]);
    expect(wrapper.emitted("selectChapter")).toBeUndefined();
    expect(wrapper.text()).not.toContain("Welcome body");
  });

  it("tapping a chapter asks for it and reads it once it has arrived, with the next chapter at the foot", async () => {
    const wrapper = mountReader({ chapters: CHAPTERS, chapter: null });
    await wrapper.findAll('nav[aria-label="Chapters"] button')[1].trigger("click");
    expect(wrapper.emitted("selectChapter")).toEqual([["c2"]]);
    // The parent is still fetching: nothing of the previous chapter is shown as this one.
    await wrapper.setProps({ chapter: chapterOf("c1", "Welcome", "Stale text"), loading: true });
    expect(wrapper.text()).not.toContain("Stale text");
    await wrapper.setProps({ chapter: chapterOf("c2", "Peoples", "Peoples text"), loading: false });
    await flushEditor();
    expect(wrapper.text()).toContain("Peoples text");
    const footer = wrapper.get("footer").findAll("button").map((b) => b.text());
    expect(footer).toEqual(["← Welcome", "Untitled chapter →"]);
  });

  it("the next chapter button asks for the next chapter, and Contents returns to the list", async () => {
    const wrapper = mountReader({ chapters: CHAPTERS, chapter: chapterOf("c1", "Welcome") });
    await wrapper.findAll('nav[aria-label="Chapters"] button')[0].trigger("click");
    await flushEditor();
    await wrapper.get("footer").findAll("button").find((b) => b.text().includes("Peoples"))!.trigger("click");
    expect(wrapper.emitted("selectChapter")?.at(-1)).toEqual(["c2"]);
    await wrapper.findAll("button").find((b) => b.text() === "Contents")!.trigger("click");
    expect(wrapper.find('nav[aria-label="Chapters"]').exists()).toBe(true);
  });

  it("renders a cover, a read-aloud box, a table and an image", async () => {
    const wrapper = mountReader({ chapter: { id: "c1", title: "Chapter One", content: RICH_CONTENT } });
    await flushEditor();
    expect(wrapper.find('div[data-type="coverPage"]').exists()).toBe(true);
    expect(wrapper.find(".sc-descriptive").exists()).toBe(true);
    expect(wrapper.find(".tableWrapper table").exists()).toBe(true);
    expect(wrapper.find("img[data-layout-mode]").exists()).toBe(true);
  });

  it("returns to the contents when the chapter being read is deleted, instead of going blank", async () => {
    const wrapper = mountReader({ chapters: CHAPTERS, chapter: null });
    await wrapper.findAll('nav[aria-label="Chapters"] button')[1].trigger("click");
    await wrapper.setProps({ chapter: chapterOf("c2", "Peoples", "Peoples text") });
    await flushEditor();
    expect(wrapper.text()).toContain("Peoples text");

    // The DM deletes the chapter; the next read no longer lists it or returns it.
    await wrapper.setProps({ chapters: [CHAPTERS[0], CHAPTERS[2]], chapter: null });
    const rows = wrapper.findAll('nav[aria-label="Chapters"] button').map((b) => b.text());
    expect(rows).toEqual(["Welcome", "Untitled chapter"]);
  });

  it("names the document by what it is, not by its doc type, for a player", () => {
    const wrapper = mountReader({ book: makeBook({ kind: "handout", campaign_id: "camp-1" }), audience: "player" });
    expect(wrapper.find("header").text()).toContain("Handout");
    expect(wrapper.find("header").text()).not.toContain("Adventure");
  });

  it("falls back to backTo, and renders the actions slot in the header", async () => {
    const wrapper = mountReader({ backTo: "/play/journal" }, { actions: '<button data-test="give">Give to players</button>' });
    expect(wrapper.find("header [data-test='give']").exists()).toBe(true);
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    await wrapper.get('button[aria-label="Back to Scriptorium"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/play/journal");
  });

  it("passes the audience through to ScriptoriumDocumentView", () => {
    const wrapper = mountReader({ book: makeBook({ campaign_id: "camp-1" }), audience: "player" });
    expect(wrapper.findComponent({ name: "ScriptoriumDocumentView" }).props("audience")).toBe("player");
  });

  it("goes back through history when there is some", async () => {
    Object.defineProperty(window.history, "length", { value: 3, configurable: true });
    const wrapper = mountReader();
    await wrapper.get('button[aria-label="Back to Scriptorium"]').trigger("click");
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("names where a document lives: this campaign, another of the DM's, or everywhere", () => {
    mocks.activeId.value = "camp-here";
    mocks.activeName.value = "The Southern Road";
    expect(mountReader({ book: makeBook({ campaign_id: "camp-here" }) }).text()).toContain("The Southern Road");
    expect(mountReader({ book: makeBook({ campaign_id: "camp-other" }) }).text()).toContain("Curse of Strahd");
    expect(mountReader({ book: makeBook({ campaign_id: null }) }).text()).toContain("General");
  });

  it("never asks for the DM's campaign list on a player's read", () => {
    mountReader({ audience: "player" });
    expect(mocks.dmCampaigns).toHaveBeenCalledWith({ enabled: false });
    mocks.dmCampaigns.mockClear();
    mountReader();
    expect(mocks.dmCampaigns).toHaveBeenCalledWith({ enabled: true });
  });

  it("wears the document's own look, a paper included", () => {
    expect(mountReader({ book: makeBook({ theme: "phb2014" }) }).find(".theme-phb2014").exists()).toBe(true);
    expect(mountReader({ book: makeBook({ theme: "onednd2024" }) }).find(".theme-phb2014").exists()).toBe(false);
    expect(mountReader({ book: makeBook({ kind: "handout", theme: "notice" }) }).find(".theme-notice").exists()).toBe(true);
  });
});
