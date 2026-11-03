import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

// A stand-in for the real editor: a toolbar button and a ProseMirror-like text area,
// inside one root, which is the shape the focus-toolbar editor has.
vi.mock("./RichTextEditor.vue", () => ({
  __esModule: true,
  default: {
    name: "RichTextEditor",
    props: { modelValue: String, toolbar: String, size: String, placeholder: String, autofocus: Boolean },
    emits: ["update:modelValue"],
    template: `<div class="stub-editor">
      <div class="tb"><button type="button" class="bold">B</button></div>
      <div class="ProseMirror" contenteditable="true" tabindex="0" @input="$emit('update:modelValue', 'typed')"></div>
    </div>`,
  },
}));

import TapToEditRichText from "./TapToEditRichText.vue";

const para = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

async function open(modelValue: string | null = para("Protect the village")) {
  const wrapper = mount(TapToEditRichText, {
    props: { modelValue, label: "bonds", placeholder: "Tap to add bonds…" },
    attachTo: document.body,
  });
  await wrapper.get("[role=button]").trigger("click");
  await flushPromises();
  return wrapper;
}

describe("TapToEditRichText", () => {
  it("reads as a viewer until tapped, then shows the editor", async () => {
    const wrapper = mount(TapToEditRichText, { props: { modelValue: para("Hello"), label: "bonds" } });
    expect(wrapper.find(".stub-editor").exists()).toBe(false);
    expect(wrapper.text()).toContain("Hello");
    await wrapper.get("[role=button]").trigger("click");
    await flushPromises();
    expect(wrapper.find(".stub-editor").exists()).toBe(true);
    expect(wrapper.find("[role=button]").exists()).toBe(false);
  });

  it.each(["Enter", " "])("opens from the keyboard with %j, so it is not touch-only", async (key) => {
    const wrapper = mount(TapToEditRichText, { props: { modelValue: para("Hello"), label: "bonds" } });
    await wrapper.get("[role=button]").trigger("keydown", { key });
    await flushPromises();
    expect(wrapper.find(".stub-editor").exists()).toBe(true);
  });

  it("shows the prompt for empty text, including a doc that is only an empty paragraph", () => {
    for (const modelValue of [null, "", EMPTY_DOC]) {
      const wrapper = mount(TapToEditRichText, { props: { modelValue, label: "bonds", placeholder: "Tap to add bonds…" } });
      expect(wrapper.text()).toBe("Tap to add bonds…");
    }
  });

  it("opens the editor with the cursor in it, so a tap is ready to type", async () => {
    const wrapper = await open();
    expect(wrapper.getComponent({ name: "RichTextEditor" }).props("autofocus")).toBe(true);
    wrapper.unmount();
  });

  it("passes what the editor emits straight through", async () => {
    const wrapper = await open();
    await wrapper.get(".ProseMirror").trigger("input");
    expect(wrapper.emitted("update:modelValue")).toEqual([["typed"]]);
    wrapper.unmount();
  });

  it("leaves edit mode when focus moves outside", async () => {
    const wrapper = await open();
    await wrapper.get(".ProseMirror").trigger("focusout", { relatedTarget: document.body });
    expect(wrapper.find(".stub-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("leaves edit mode when focus is lost to nothing (tap on blank page)", async () => {
    const wrapper = await open();
    await wrapper.get(".ProseMirror").trigger("focusout", { relatedTarget: null });
    expect(wrapper.find(".stub-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("stays in edit mode when focus moves to the toolbar", async () => {
    const wrapper = await open();
    await wrapper.get(".ProseMirror").trigger("focusout", { relatedTarget: wrapper.get(".bold").element });
    expect(wrapper.find(".stub-editor").exists()).toBe(true);
    wrapper.unmount();
  });

  it("leaves edit mode on Escape", async () => {
    const wrapper = await open();
    await wrapper.get(".ProseMirror").trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".stub-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("does not treat the swapped-out viewer's own focusout as leaving", async () => {
    const wrapper = mount(TapToEditRichText, { props: { modelValue: para("Hello"), label: "bonds" }, attachTo: document.body });
    const block = wrapper.get("[role=button]");
    // Same tick, before Vue removes the block: that is when a browser reports it.
    block.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    block.element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    await flushPromises();
    expect(wrapper.find(".stub-editor").exists()).toBe(true);
    wrapper.unmount();
  });
});
