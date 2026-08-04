import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { AiGenerated } from "./AiGenerated";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string | object = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [StarterKit, AiGenerated],
  });
}

describe("AiGenerated node (#606)", () => {
  it("renders data-ai-generated and data-ai-model into HTML output", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "aiGenerated",
          attrs: { model: "gpt-5" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "A chronicle." }] }],
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain('data-ai-generated="true"');
    expect(html).toContain('data-ai-model="gpt-5"');
  });

  it("omits data-ai-model when the model is unknown", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "aiGenerated",
          attrs: { model: null },
          content: [{ type: "paragraph", content: [{ type: "text", text: "A chronicle." }] }],
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain('data-ai-generated="true"');
    expect(html).not.toContain("data-ai-model");
  });

  it("round-trips through JSON (parse -> serialize -> reparse) preserving the wrapper and its attrs", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "aiGenerated",
          attrs: { model: "claude-sonnet-5" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Session recap." }] }],
        },
      ],
    };
    editor = makeEditor(json);
    const roundTripped = editor.getJSON();
    editor.destroy();
    // Simulate a subsequent load — the app parses the stored JSON string back
    // into the editor on every open, exactly what the note editor does.
    editor = makeEditor(roundTripped);
    const finalJson = editor.getJSON();
    expect(finalJson.content?.[0]?.type).toBe("aiGenerated");
    expect(finalJson.content?.[0]?.attrs?.model).toBe("claude-sonnet-5");
    expect(editor.getHTML()).toContain('data-ai-model="claude-sonnet-5"');
  });

  it("parses raw stored HTML with data-ai-generated back into the node", () => {
    editor = makeEditor(
      '<div data-ai-generated="true" data-ai-model="gpt-5"><p>Recap text</p></div>',
    );
    const json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe("aiGenerated");
    expect(json.content?.[0]?.attrs?.model).toBe("gpt-5");
  });

  it("marks only the wrapped block — a sibling human-written paragraph carries no marker", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Human-written intro." }] },
        {
          type: "aiGenerated",
          attrs: { model: "gpt-5" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "AI recap." }] }],
        },
      ],
    });
    const html = editor.getHTML();
    const wrapperCount = (html.match(/data-ai-generated="true"/g) ?? []).length;
    expect(wrapperCount).toBe(1);
    expect(html).toContain("Human-written intro.");
    expect(html).toContain("AI recap.");
  });

  it("surviving a further edit inside the wrapper keeps the marker on the root element", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "aiGenerated",
          attrs: { model: "gpt-5" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "AI recap." }] }],
        },
      ],
    });
    // Simulate the DM editing the text after accepting the draft.
    editor.commands.insertContentAt(editor.state.doc.content.size - 2, " Edited by DM.");
    const html = editor.getHTML();
    expect(html).toContain('data-ai-generated="true"');
    expect(html).toContain("Edited by DM.");
  });
});
