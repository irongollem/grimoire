import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import InlineEditRich from "./InlineEditRich.vue";

// The real editor needs Tiptap and Supabase; the property here is open/close behaviour.
const EditorStub = defineComponent({
  props: { modelValue: { type: String, default: null } },
  emits: ["update:modelValue"],
  template: `<div data-test="editor"><button data-test="type" @click="$emit('update:modelValue', 'typed')" /></div>`,
});
const ViewerStub = defineComponent({ props: { content: { type: String, default: null } }, template: `<div data-test="viewer" />` });

// onClickOutside arms on pointerdown, fires on the following click, and swallows
// clicks in the same tick as the previous one (the click that opened the editor).
async function outsideClick(el: HTMLElement) {
  await new Promise((r) => setTimeout(r, 0));
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  el.click();
  await new Promise((r) => setTimeout(r, 0));
}

const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] });

function make(modelValue: string | null) {
  return mount(InlineEditRich, {
    attachTo: document.body,
    props: { modelValue, placeholder: "Describe it", ariaLabel: "Description" },
    global: { stubs: { RichTextEditor: EditorStub, RichTextViewer: ViewerStub } },
  });
}

describe("InlineEditRich", () => {
  it("shows the rendered text, then the editor after a click", async () => {
    const w = make(doc);
    expect(w.find("[data-test=viewer]").exists()).toBe(true);
    await w.get("[role=button]").trigger("click");
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    w.unmount();
  });

  it("Enter on the text opens the editor (keyboard reachable)", async () => {
    const w = make(doc);
    await w.get("[role=button]").trigger("keydown", { key: "Enter" });
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    w.unmount();
  });

  it("an empty document shows the placeholder instead of the viewer", () => {
    const empty = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    const w = make(empty);
    expect(w.text()).toContain("Describe it");
    expect(w.find("[data-test=viewer]").exists()).toBe(false);
    w.unmount();
  });

  it("forwards editor changes so a parent's autosave sees them while typing", async () => {
    const w = make(doc);
    await w.get("[role=button]").trigger("click");
    await w.get("[data-test=type]").trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["typed"]]);
    w.unmount();
  });

  it("clicking outside closes the editor and says done", async () => {
    const w = make(doc);
    await w.get("[role=button]").trigger("click");
    await outsideClick(document.body);
    await w.vm.$nextTick();
    expect(w.find("[data-test=editor]").exists()).toBe(false);
    expect(w.emitted("done")).toHaveLength(1);
    w.unmount();
  });

  it("a click inside the teleported @-mention popup does not close it", async () => {
    const w = make(doc);
    await w.get("[role=button]").trigger("click");
    const popup = document.createElement("div");
    popup.className = "entity-suggestion-popup";
    const item = document.createElement("button");
    popup.appendChild(item);
    document.body.appendChild(popup);
    await outsideClick(item);
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    expect(w.emitted("done")).toBeUndefined();
    popup.remove();
    w.unmount();
  });

  it("Escape closes the editor", async () => {
    const w = make(doc);
    await w.get("[role=button]").trigger("click");
    await w.get("[data-test=editor]").trigger("keydown", { key: "Escape" });
    expect(w.find("[data-test=editor]").exists()).toBe(false);
    w.unmount();
  });
});
