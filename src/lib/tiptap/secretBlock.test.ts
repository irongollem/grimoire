// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor, generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { SecretBlock } from "./secretBlock";

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const ID2 = "11111111-2222-4333-8444-555555555555";
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("SecretBlock", () => {
  it("survives an HTML round trip with its content, so a load-save cycle cannot drop it", () => {
    const original = doc(para("Public."), { type: "secretBlock", attrs: { secretId: ID }, content: [para("The vizier is the lich.")] });
    const html = generateHTML(original, [StarterKit, SecretBlock]);
    expect(html).toContain('data-type="secretBlock"');
    expect(html).toContain(`data-secret-id="${ID}"`);
    expect(generateJSON(html, [StarterKit, SecretBlock])).toEqual(original);
  });

  it("keeps the node when it loads into an editor that does not offer the control", () => {
    const original = doc({ type: "secretBlock", attrs: { secretId: ID }, content: [para("keep me")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    expect(editor.getJSON()).toEqual(original);
    editor.destroy();
  });

  it("wraps the current block, and lifts it back out on a second toggle", () => {
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: doc(para("hush")) });
    editor.commands.setTextSelection(2);
    editor.commands.toggleSecretBlock();
    expect(editor.getJSON().content?.[0]?.type).toBe("secretBlock");
    editor.commands.toggleSecretBlock();
    expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
    editor.destroy();
  });

  it("gives the block it creates an id", () => {
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: doc(para("hush")) });
    editor.commands.setTextSelection(2);
    editor.commands.toggleSecretBlock();
    const id = editor.getJSON().content?.[0]?.attrs?.secretId;
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    editor.destroy();
  });

  it("re-mints the copy when a block with the same id is inserted", () => {
    const original = doc({ type: "secretBlock", attrs: { secretId: ID }, content: [para("one")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    const node = editor.state.doc.firstChild;
    if (!node) throw new Error("no block");
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, node));
    const blocks = (editor.getJSON().content ?? []).filter((n) => n.type === "secretBlock");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.attrs?.secretId).toBe(ID);
    const copy = blocks[1]?.attrs?.secretId;
    expect(copy).toMatch(/^[0-9a-f-]{36}$/);
    expect(copy).not.toBe(ID);
    editor.destroy();
  });

  it("leaves an id-less block alone on load, and mints once the user edits", () => {
    const original = doc({ type: "secretBlock", content: [para("old")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    // Loading adds nothing but the attribute's null default: no id is minted.
    expect(editor.getJSON()).toEqual(doc({ type: "secretBlock", attrs: { secretId: null }, content: [para("old")] }));
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    expect(editor.getJSON().content?.[0]?.attrs?.secretId).toMatch(/^[0-9a-f-]{36}$/);
    editor.destroy();
  });

  it("keeps a valid id through an edit", () => {
    const original = doc({ type: "secretBlock", attrs: { secretId: ID2 }, content: [para("old")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    expect(editor.getJSON().content?.[0]?.attrs?.secretId).toBe(ID2);
    editor.destroy();
  });

  it("keeps the id on a cut-and-paste move and never leaks the paste mark", () => {
    const original = doc(para("top"), { type: "secretBlock", attrs: { secretId: ID }, content: [para("one")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    const node = editor.state.doc.lastChild;
    if (!node) throw new Error("no block");
    editor.view.dispatch(editor.state.tr.delete(editor.state.doc.content.size - node.nodeSize, editor.state.doc.content.size));
    editor.commands.setTextSelection(1);
    editor.view.pasteHTML(`<div data-type="secretBlock" data-secret-id="${ID}"><p>one</p></div>`);
    const blocks = (editor.getJSON().content ?? []).filter((n) => n.type === "secretBlock");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.attrs?.secretId).toBe(ID);
    expect(JSON.stringify(editor.getJSON())).not.toContain("pasted:");
    editor.destroy();
  });

  it("gives a pasted copy the new id even when it lands above the original", () => {
    const original = doc(para("top"), { type: "secretBlock", attrs: { secretId: ID }, content: [para("one")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: original });
    editor.commands.setTextSelection(1);
    editor.view.pasteHTML(`<div data-type="secretBlock" data-secret-id="${ID}"><p>one</p></div>`);
    const blocks = (editor.getJSON().content ?? []).filter((n) => n.type === "secretBlock");
    expect(blocks).toHaveLength(2);
    const ids = blocks.map((b) => b.attrs?.secretId);
    expect(ids[0]).not.toBe(ID);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ID);
    expect(JSON.stringify(editor.getJSON())).not.toContain("pasted:");
    editor.destroy();
  });

  it("replaces an id that is not a UUID, whether it was stored that way or arrived on a paste", () => {
    const stored = doc({ type: "secretBlock", attrs: { secretId: "hello" }, content: [para("old")] });
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: stored });
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    expect(editor.getJSON().content?.[0]?.attrs?.secretId).toMatch(/^[0-9a-f-]{36}$/);
    editor.destroy();

    const target = new Editor({ extensions: [StarterKit, SecretBlock], content: doc(para("top")) });
    target.commands.setTextSelection(1);
    target.view.pasteHTML('<div data-type="secretBlock" data-secret-id="not-a-uuid"><p>one</p></div>');
    const id = (target.getJSON().content ?? []).find((n) => n.type === "secretBlock")?.attrs?.secretId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    target.destroy();
  });

  it("gives a block that repeats an id already used above it a new one, on load and edit", () => {
    const twice = doc(
      { type: "secretBlock", attrs: { secretId: ID }, content: [para("one")] },
      { type: "secretBlock", attrs: { secretId: ID }, content: [para("two")] },
    );
    const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: twice });
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    const ids = (editor.getJSON().content ?? []).map((n) => n.attrs?.secretId);
    expect(ids[0]).toBe(ID);
    expect(ids[1]).not.toBe(ID);
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
    editor.destroy();
  });

  describe("Mod-Alt-S", () => {
    const press = (editor: Editor) => {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      const event = new KeyboardEvent("keydown", { key: "s", code: "KeyS", altKey: true, metaKey: mac, ctrlKey: !mac, bubbles: true });
      editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
    };

    it("wraps the block when the editor offers the control", () => {
      const editor = new Editor({ extensions: [StarterKit, SecretBlock.configure({ creatable: true })], content: doc(para("hush")) });
      editor.commands.setTextSelection(2);
      press(editor);
      expect(editor.getJSON().content?.[0]?.type).toBe("secretBlock");
      editor.destroy();
    });

    it("does nothing in an editor that does not offer it", () => {
      const editor = new Editor({ extensions: [StarterKit, SecretBlock], content: doc(para("hush")) });
      editor.commands.setTextSelection(2);
      press(editor);
      expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
      editor.destroy();
    });
  });
});
