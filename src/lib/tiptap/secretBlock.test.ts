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
});
