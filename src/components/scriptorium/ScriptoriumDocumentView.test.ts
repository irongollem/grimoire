import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScriptoriumDocumentView from "./ScriptoriumDocumentView.vue";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

/** Tiptap's core Editor fires its "create" event (and <EditorContent>'s first
 *  DOM render) from a `window.setTimeout(…, 0)` inside mount(), not
 *  synchronously — see scriptoriumExtensions.test.ts's flushCreate for the
 *  same wrinkle. A microtask-only flush isn't enough. */
function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeDoc(overrides: Partial<ScriptoriumDocument> = {}): ScriptoriumDocument {
  return {
    id: "doc-1",
    user_id: "user-1",
    title: "Test Doc",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }),
    doc_type: "custom",
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

describe("ScriptoriumDocumentView", () => {
  it("renders valid current-version content", async () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeDoc() } });
    await flushEditor();
    expect(wrapper.text()).toContain("Hello");
    expect(wrapper.text()).not.toContain("This document could not be read");
  });

  it("shows the unreadable-document state for invalid JSON, without any HTML fallback", () => {
    const wrapper = mount(ScriptoriumDocumentView, {
      props: { document: makeDoc({ content: "<p>legacy html snapshot</p>" }) },
    });
    expect(wrapper.text()).toContain("This document could not be read");
    // The raw legacy markup must never render as content.
    expect(wrapper.text()).not.toContain("legacy html snapshot");
  });

  it("shows the unreadable-document state for malformed JSON", () => {
    const wrapper = mount(ScriptoriumDocumentView, {
      props: { document: makeDoc({ content: "{not valid" }) },
    });
    expect(wrapper.text()).toContain("This document could not be read");
  });

  it("re-checks readability when the document prop's content changes", async () => {
    const doc = makeDoc({ content: "not json" });
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: doc } });
    expect(wrapper.text()).toContain("This document could not be read");

    await wrapper.setProps({
      document: makeDoc({ content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fixed" }] }] }) }),
    });
    await flushEditor();
    expect(wrapper.text()).toContain("Fixed");
    expect(wrapper.text()).not.toContain("This document could not be read");
  });

  it("renders an empty document for null content", () => {
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeDoc({ content: null }) } });
    expect(wrapper.text()).not.toContain("This document could not be read");
  });
});
