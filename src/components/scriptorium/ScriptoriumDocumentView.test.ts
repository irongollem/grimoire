import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import ScriptoriumDocumentView from "./ScriptoriumDocumentView.vue";
import type { ReadableBook } from "@/types/scriptorium.types";

/** Tiptap's core Editor fires its "create" event (and <EditorContent>'s first
 *  DOM render) from a `window.setTimeout(…, 0)` inside mount(), not
 *  synchronously — see scriptoriumExtensions.test.ts's flushCreate for the
 *  same wrinkle. A microtask-only flush isn't enough. */
function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const text = (t: string): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

function makeBook(overrides: Partial<ReadableBook> = {}): ReadableBook {
  return {
    id: "doc-1",
    title: "Test Doc",
    kind: "book",
    doc_type: "custom",
    campaign_id: null,
    theme: "onednd2024",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ScriptoriumDocumentView", () => {
  it("renders the chapter it is given", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeBook(), content: text("Hello") } });
    await flushEditor();
    expect(wrapper.text()).toContain("Hello");
  });

  it("shows the next chapter when the content changes, not the one it opened on", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeBook(), content: text("Chapter one") } });
    await flushEditor();
    await wrapper.setProps({ content: text("Chapter two") });
    await flushEditor();
    expect(wrapper.text()).toContain("Chapter two");
    expect(wrapper.text()).not.toContain("Chapter one");
  });

  it("paints a paper under its own class", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeBook({ kind: "handout", theme: "letter" }), content: text("Dear friends") } });
    await flushEditor();
    expect(wrapper.find(".sc-document-view").classes()).toContain("theme-letter");
  });

  it("defaults to the page layout (no reader modifier class)", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeBook(), content: text("Hello") } });
    await flushEditor();
    expect(wrapper.find(".sc-document-view").classes()).not.toContain("sc-document-view--reader");
  });

  it("adds the reader modifier class when layout is 'reader'", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeBook(), content: text("Hello"), layout: "reader" } });
    await flushEditor();
    expect(wrapper.find(".sc-document-view").classes()).toContain("sc-document-view--reader");
  });

  it("shows an empty state for a player document with no campaign", () => {
    const wrapper = mount(ScriptoriumDocumentView, {
      props: { document: makeBook({ campaign_id: null }), content: text("Hello"), audience: "player" },
    });
    expect(wrapper.text()).toContain("This handout is not available");
    expect(wrapper.text()).not.toContain("Hello");
  });

  it("renders a player document that belongs to a campaign", async () => {
    const wrapper = mount(ScriptoriumDocumentView, {
      props: { document: makeBook({ campaign_id: "camp-1" }), content: text("Hello"), audience: "player" },
    });
    await flushEditor();
    expect(wrapper.text()).toContain("Hello");
  });
});
