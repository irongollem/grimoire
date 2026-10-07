// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor, generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { SecretBlock } from "./secretBlock";

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("SecretBlock", () => {
  it("survives an HTML round trip with its content, so a load-save cycle cannot drop it", () => {
    const original = doc(para("Public."), { type: "secretBlock", content: [para("The vizier is the lich.")] });
    const html = generateHTML(original, [StarterKit, SecretBlock]);
    expect(html).toContain('data-type="secretBlock"');
    expect(generateJSON(html, [StarterKit, SecretBlock])).toEqual(original);
  });

  it("keeps the node when it loads into an editor that does not offer the control", () => {
    const original = doc({ type: "secretBlock", content: [para("keep me")] });
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
});
