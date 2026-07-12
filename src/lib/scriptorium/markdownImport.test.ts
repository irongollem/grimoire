import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { markdownToScriptoriumContent, markdownTitle } from "./markdownImport";
import { importedMarkdownTemplate } from "@/data/scriptoriumTemplates/importedMarkdown";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const types = (doc: { content?: { type?: string }[] }): string[] =>
  (doc.content ?? []).map((n) => n.type ?? "");

describe("markdownToScriptoriumContent", () => {
  it("maps headings, paragraphs, and inline marks", () => {
    const doc = markdownToScriptoriumContent(
      "# Chapter One\n\nA paragraph with **bold**, _italic_, `code`, and [a link](https://example.com).",
    );
    expect(types(doc)).toEqual(["heading", "paragraph"]);
    expect(doc.content![0].attrs).toEqual({ level: 1 });
    const marks = doc.content![1].content!.flatMap((n: { marks?: { type: string; attrs?: { href?: string } }[] }) =>
      (n.marks ?? []).map((m) => m.type),
    );
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic", "code", "link"]));
    const link = doc.content![1].content!.find((n: { marks?: { type: string }[] }) =>
      n.marks?.some((m) => m.type === "link"),
    );
    expect(link!.marks![0].attrs).toEqual({ href: "https://example.com" });
  });

  it("joins soft line-breaks into one flowing paragraph", () => {
    const doc = markdownToScriptoriumContent("line one\nline two");
    expect(types(doc)).toEqual(["paragraph"]);
    expect(doc.content![0].content![0].text).toBe("line one line two");
  });

  it("maps Homebrewery \\page and \\column directives", () => {
    const doc = markdownToScriptoriumContent("before\n\n\\page\n\nmiddle\n\n\\column\n\nafter");
    expect(types(doc)).toEqual([
      "paragraph",
      "pageBreak",
      "paragraph",
      "columnBreak",
      "paragraph",
    ]);
  });

  it("maps nested lists and keeps item marks", () => {
    const doc = markdownToScriptoriumContent("- one\n- **two**\n  - nested\n\n1. first");
    expect(types(doc)).toEqual(["bulletList", "orderedList"]);
    const secondItem = doc.content![0].content![1];
    expect(secondItem.content!.map((n) => n.type)).toEqual(["paragraph", "bulletList"]);
  });

  it("maps GFM tables to table nodes with a header row", () => {
    const doc = markdownToScriptoriumContent("| d8 | Rumor |\n|---|---|\n| 1 | The bell rings |");
    expect(types(doc)).toEqual(["table"]);
    const [header, row] = doc.content![0].content!;
    expect(header.content!.map((c) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(row.content!.map((c) => c.type)).toEqual(["tableCell", "tableCell"]);
  });

  it("wraps ::: read-aloud in a descriptiveBlock and ::: note in a noteBlock", () => {
    const doc = markdownToScriptoriumContent(
      "::: read-aloud\n_The grass is checkered, green and a paler green._\n:::\n\n::: note\nDM guidance goes here.\n:::",
    );
    expect(types(doc)).toEqual(["descriptiveBlock", "noteBlock"]);
    expect(doc.content![0].content![0].type).toBe("paragraph");
  });

  it("wraps ::: quote and turns a trailing em-dash line into an attribution", () => {
    const doc = markdownToScriptoriumContent(
      "::: quote\nStay as long as you like.\n\n— The Kind Country\n:::",
    );
    expect(types(doc)).toEqual(["quoteBlock"]);
    const children = doc.content![0].content!;
    expect(children.map((n) => n.type)).toEqual(["paragraph", "attribution"]);
    expect(children[1].content![0].text).toBe("The Kind Country");
  });

  it("passes unknown directives through unwrapped", () => {
    const doc = markdownToScriptoriumContent("::: mystery\nStill here.\n:::");
    expect(types(doc)).toEqual(["paragraph"]);
  });

  it("closes an unclosed directive at end of input", () => {
    const doc = markdownToScriptoriumContent("::: note\nTrailing aside.");
    expect(types(doc)).toEqual(["noteBlock"]);
  });

  it("maps blockquotes, rules, and fenced code", () => {
    const doc = markdownToScriptoriumContent("> quoted\n\n---\n\n```txt\nverbatim\n```");
    expect(types(doc)).toEqual(["blockquote", "horizontalRule", "codeBlock"]);
  });

  it("lifts images out of paragraphs to block level", () => {
    const doc = markdownToScriptoriumContent("Before ![a map](https://example.com/map.png) after.");
    expect(types(doc)).toEqual(["paragraph", "image"]);
    expect(doc.content![1].attrs!.src).toBe("https://example.com/map.png");
  });

  it("returns an empty paragraph for empty input", () => {
    expect(types(markdownToScriptoriumContent(""))).toEqual(["paragraph"]);
  });
});

describe("markdownTitle", () => {
  it("uses the first # heading", () => {
    expect(markdownTitle("intro\n\n# The Kind Country\n\n## Later", "fallback")).toBe(
      "The Kind Country",
    );
  });

  it("falls back when there is no # heading", () => {
    expect(markdownTitle("## Only a subheading", "ch1")).toBe("ch1");
  });
});

// A campaign-chapter-shaped fixture: every construct the importer emits.
const FIXTURE = `# Act One: The Checkered Hillside

## Opening narration

Read this aloud, slowly.

::: read-aloud
_You are lying on grass. The grass is checkered, green and a paler green._

_Three suns are up. You decide not to look at the third one._
:::

::: note
_GM-side, deep lens: read the passage one beat slower than you think._
:::

**This is the first contract-moment.** Ask each player one quiet question:

- "What's the last thing you remember before this?"
- "What were you holding?"

| d8 | Wrongness |
|---|---|
| 1 | The grass remembers them |
| 2 | The sky has a seam |

::: quote
Stay as long as you like.

— painted above the gate
:::

\\page

## Act Two begins here

> **[ VISUAL CUE: show the prop now ]**
`;

describe("editor round-trip", () => {
  it("loads a converted chapter without dropping top-level blocks", () => {
    const built = markdownToScriptoriumContent(FIXTURE);
    editor = new Editor({
      element: document.createElement("div"),
      content: built,
      extensions: createScriptoriumExtensions(),
    });
    const got = types(editor.getJSON());
    // Every converted block survives schema validation in order (ProseMirror
    // may append a trailing paragraph, which the prefix comparison ignores).
    expect(got.slice(0, types(built).length)).toEqual(types(built));
    expect(editor.getHTML()).toContain('data-type="descriptiveBlock"');
    expect(editor.getHTML()).toContain('data-type="noteBlock"');
    expect(editor.getHTML()).toContain('data-type="attribution"');
  });
});

describe("importedMarkdownTemplate", () => {
  it("titles the template from the first heading and builds fresh docs", () => {
    const t = importedMarkdownTemplate("ch1.md", FIXTURE);
    expect(t.name).toBe("Act One: The Checkered Hillside");
    expect(t.description).toContain("ch1.md");
    const a = t.build();
    const b = t.build();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("falls back to the file name without its extension", () => {
    expect(importedMarkdownTemplate("prologue.md", "no heading here").name).toBe("prologue");
  });
});
