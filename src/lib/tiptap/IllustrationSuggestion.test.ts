import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// The node view is a Vue component; these tests only exercise the schema.
vi.mock("@tiptap/vue-3", () => ({ VueNodeViewRenderer: () => () => ({}) }));
vi.mock("@/components/tiptap/IllustrationSuggestionChip.vue", () => ({ default: {} }));

const { IllustrationSuggestion, findIllustrationSuggestion } = await import("./IllustrationSuggestion");

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "The party entered the tower." }] },
        { type: "illustrationSuggestion", attrs: { prompt: "A ruined tower at dusk" } },
        { type: "paragraph", content: [{ type: "text", text: "Then the crypt." }] },
        { type: "illustrationSuggestion", attrs: { prompt: "A flooded crypt" } },
      ],
    },
    extensions: [StarterKit, IllustrationSuggestion],
  });
}

function suggestionPositions(e: Editor): Record<string, number> {
  const out: Record<string, number> = {};
  e.state.doc.descendants((node, pos) => {
    if (node.type.name === "illustrationSuggestion") out[node.attrs.prompt as string] = pos;
  });
  return out;
}

describe("findIllustrationSuggestion", () => {
  it("finds the clicked chip at its recorded position", () => {
    editor = makeEditor();
    const pos = suggestionPositions(editor)["A flooded crypt"];
    const found = findIllustrationSuggestion(editor.state.doc, { pos, prompt: "A flooded crypt" });
    expect(found?.pos).toBe(pos);
  });

  it("follows the chip when content above it has shifted it", () => {
    editor = makeEditor();
    const stale = suggestionPositions(editor)["A flooded crypt"];
    editor.chain().insertContentAt(0, "<p>A line added above.</p>").run();
    const found = findIllustrationSuggestion(editor.state.doc, { pos: stale, prompt: "A flooded crypt" });
    expect(found?.pos).toBe(suggestionPositions(editor)["A flooded crypt"]);
    expect(found?.pos).not.toBe(stale);
  });

  it("does not mistake another chip at the recorded position for the clicked one", () => {
    editor = makeEditor();
    const towerPos = suggestionPositions(editor)["A ruined tower at dusk"];
    const found = findIllustrationSuggestion(editor.state.doc, { pos: towerPos, prompt: "A flooded crypt" });
    expect(found?.node.attrs.prompt).toBe("A flooded crypt");
  });

  it("returns null once the chip has been deleted", () => {
    editor = makeEditor();
    const pos = suggestionPositions(editor)["A flooded crypt"];
    editor.chain().deleteRange({ from: pos, to: pos + 1 }).run();
    expect(findIllustrationSuggestion(editor.state.doc, { pos, prompt: "A flooded crypt" })).toBeNull();
  });
});
