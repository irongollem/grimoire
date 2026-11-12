// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { dividerVariant } from "@/scriptorium/tiptap/divider";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function load(content: string) {
  editor = new Editor({ element: document.createElement("div"), content, extensions: createScriptoriumExtensions() });
  return editor.getJSON().content ?? [];
}

describe("Divider node", () => {
  // Fails on: a style (rule, stars) reloading as the flourish, so a saved choice is lost on every open.
  it.each(["flourish", "rule", "stars"])("round-trips the %s style", (variant) => {
    const [node] = load(`<div data-type="divider" data-variant="${variant}"></div>`);
    expect(node).toMatchObject({ type: "divider", attrs: { variant } });
    expect(editor?.getHTML()).toContain(`class="sc-divider sc-divider--${variant}"`);
  });

  // Fails on: a hand-edited or pasted divider with an unknown style rendering a class the stylesheet has no rule for.
  it("reads an unknown or missing style as the flourish", () => {
    expect(load('<div data-type="divider" data-variant="zigzag"></div>')[0]?.attrs?.variant).toBe("flourish");
    expect(load('<div data-type="divider"></div>')[0]?.attrs?.variant).toBe("flourish");
    expect(dividerVariant(42)).toBe("flourish");
  });

  // Fails on: the divider claiming <hr>, which is a legacy page break and would turn every rule into a new page.
  it("leaves <hr> to the horizontal rule", () => {
    const types = load("<p>a</p><hr><p>b</p>").map((n) => n.type);
    expect(types).toContain("horizontalRule");
    expect(types).not.toContain("divider");
  });

  // Fails on: the divider missing from the block-id list, so the click-to-edit mapping cannot find it.
  it("takes a block id like the other blocks", async () => {
    load('<div data-type="divider"></div>');
    await new Promise((r) => setTimeout(r, 0));
    const [node] = editor?.getJSON().content ?? [];
    expect(typeof node?.attrs?.blockId).toBe("string");
  });
});
