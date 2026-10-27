// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { markdownToScriptoriumContent, markdownTitle, type ArtSlot } from "./markdownImport";
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

const textOf = (node: { text?: string; content?: unknown[] }): string =>
  node.text ?? (node.content as { text?: string; content?: unknown[] }[] | undefined)?.map(textOf).join("") ?? "";

describe("directive arguments", () => {
  it("accepts arguments after the directive name", () => {
    const doc = markdownToScriptoriumContent("::: lens light\nHello\n:::");
    expect(doc.content![0].type).toBe("lensPair");
  });
});

describe("::: lens", () => {
  const LABELS = ["**Bright.**", "**Bright:**", "**Bright lens:**", "**Bright Lens.**", "**BRIGHT.**"];
  for (const label of LABELS) {
    it(`reads ${label} as the Bright label and strips it`, () => {
      const doc = markdownToScriptoriumContent(`::: lens\n${label} A kind tower.\n\n**Deep.** A tomb.\n:::`);
      const pair = doc.content![0];
      expect(pair.type).toBe("lensPair");
      expect(pair.attrs).toEqual({ variant: "boxed" });
      expect(pair.content!.map((n) => n.type)).toEqual(["lensBright", "lensDeep"]);
      expect(textOf(pair.content![0])).toBe("A kind tower.");
      expect(textOf(pair.content![1])).toBe("A tomb.");
    });
  }

  it("accepts the Deep label forms too", () => {
    for (const label of ["**Deep.**", "**Deep:**", "**Deep lens:**", "**deep Lens.**"]) {
      const doc = markdownToScriptoriumContent(`::: lens\n**Bright.** b\n\n${label} d\n:::`);
      expect(textOf(doc.content![0].content![1])).toBe("d");
    }
  });

  it("puts text before any label in the Bright half", () => {
    const doc = markdownToScriptoriumContent("::: lens\nOpening.\n\n**Deep.** Under it.\n:::");
    const [bright, deep] = doc.content![0].content!;
    expect(textOf(bright)).toBe("Opening.");
    expect(textOf(deep)).toBe("Under it.");
  });

  it("keeps following paragraphs and lists with the half that opened them", () => {
    const doc = markdownToScriptoriumContent("::: lens\n**Bright.** One.\n\nTwo.\n\n**Deep.** Three.\n\n- four\n:::");
    const [bright, deep] = doc.content![0].content!;
    expect(bright.content!.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(deep.content!.map((n) => n.type)).toEqual(["paragraph", "bulletList"]);
  });

  it("drops a label-only paragraph instead of leaving it empty", () => {
    const doc = markdownToScriptoriumContent("::: lens\n**Bright.**\n\nBody.\n\n**Deep.** d\n:::");
    expect(doc.content![0].content![0].content).toHaveLength(1);
  });

  it("leaves Deep as an empty paragraph when only Bright is written", () => {
    const doc = markdownToScriptoriumContent("::: lens\n**Bright.** Only this.\n:::");
    expect(doc.content![0].content![1].content).toEqual([{ type: "paragraph" }]);
  });

  it("sets the light variant and wraps in a wide block on request", () => {
    const light = markdownToScriptoriumContent("::: lens light\n**Bright.** a\n:::");
    expect(light.content![0].attrs).toEqual({ variant: "light" });
    const wide = markdownToScriptoriumContent("::: lens wide light\n**Bright.** a\n:::");
    expect(wide.content![0].type).toBe("wideBlock");
    expect(wide.content![0].content![0].attrs).toEqual({ variant: "light" });
  });

  it("produces a document the Scriptorium schema accepts", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: createScriptoriumExtensions(),
      content: markdownToScriptoriumContent("::: lens wide\n**Bright.** a\n\n**Deep.** b\n:::"),
    });
    expect(editor.getHTML()).toContain('data-type="lensPair"');
    expect(editor.getHTML()).toContain('class="sc-wide"');
  });
});

describe("::: wide", () => {
  it("wraps the contained blocks in a wide block", () => {
    const doc = markdownToScriptoriumContent("::: wide\n## Title\n\nBody.\n:::");
    expect(doc.content![0].type).toBe("wideBlock");
    expect(doc.content![0].content!.map((n) => n.type)).toEqual(["heading", "paragraph"]);
  });
});

describe("::: art", () => {
  const SOURCE = [
    "::: art",
    "slug: tower-at-dusk",
    "size: half",
    "lane: landscape",
    "alt: A leaning tower",
    "caption: The tower at dusk",
    "brief: A leaning tower, low sun",
    ":::",
  ].join("\n");

  it("emits the image and an italic caption when the art resolves", () => {
    let seen: ArtSlot | null = null;
    const doc = markdownToScriptoriumContent(SOURCE, {
      resolveArt: (slot) => {
        seen = slot;
        return { src: "https://cdn.example/tower.webp" };
      },
    });
    expect(seen).toEqual({
      slug: "tower-at-dusk",
      size: "half",
      lane: "landscape",
      existing: undefined,
      alt: "A leaning tower",
      caption: "The tower at dusk",
      brief: "A leaning tower, low sun",
    });
    expect(types(doc)).toEqual(["image", "paragraph"]);
    expect(doc.content![0].attrs).toMatchObject({ src: "https://cdn.example/tower.webp", width: "50%", alt: "A leaning tower" });
    expect(doc.content![1].content![0]).toMatchObject({ text: "The tower at dusk", marks: [{ type: "italic" }] });
  });

  it("makes a full or column image 100% wide, and a wide or opener one a wide block", () => {
    const resolve = { resolveArt: () => ({ src: "x.webp" }) };
    const full = markdownToScriptoriumContent("::: art\nsize: full\n:::", resolve);
    expect(full.content![0].attrs).toMatchObject({ width: "100%" });
    for (const size of ["wide", "opener"]) {
      const doc = markdownToScriptoriumContent(`::: art\nsize: ${size}\ncaption: C\n:::`, resolve);
      expect(doc.content![0].type).toBe("wideBlock");
      expect(doc.content![0].content!.map((n) => n.type)).toEqual(["image", "paragraph"]);
    }
  });

  it("falls back to a column image for an unknown size", () => {
    let size: string | null = null;
    markdownToScriptoriumContent("::: art\nsize: huge\n:::", {
      resolveArt: (slot) => {
        size = slot.size;
        return null;
      },
    });
    expect(size).toBe("column");
  });

  it("leaves an 'Art to come' note with the brief when nothing resolves", () => {
    const doc = markdownToScriptoriumContent(SOURCE);
    expect(doc.content![0].type).toBe("noteBlock");
    const para = doc.content![0].content![0];
    expect(para.content!.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
    expect(para.content![0].text).toBe("Art to come: The tower at dusk");
    expect(para.content![2].text).toBe("Brief: A leaning tower, low sun");
  });

  it("names the source file when the author said it existed but it did not resolve", () => {
    const doc = markdownToScriptoriumContent("::: art\ncaption: Map\nexisting: maps/old.png\n:::", {
      resolveArt: () => null,
    });
    expect(doc.content![0].content![0].content![2].text).toBe("Source: maps/old.png");
  });

  it("is valid for the Scriptorium schema in both outcomes", () => {
    for (const resolved of [true, false]) {
      editor = new Editor({
        element: document.createElement("div"),
        extensions: createScriptoriumExtensions(),
        content: markdownToScriptoriumContent(SOURCE, { resolveArt: () => (resolved ? { src: "https://x.test/a.webp" } : null) }),
      });
      expect(editor.getHTML()).toContain(resolved ? "<img" : 'data-type="noteBlock"');
      editor.destroy();
    }
    editor = null;
  });
});

describe("::: statblock and ::: embed", () => {
  it("emits a monster entityEmbed when the entity resolves", () => {
    const refs: { type: string; name: string }[] = [];
    const doc = markdownToScriptoriumContent("::: statblock\nname: Goblin Boss\n:::", {
      resolveEmbed: (ref) => {
        refs.push(ref);
        return { id: "m-1" };
      },
    });
    expect(refs).toEqual([{ type: "monster", name: "Goblin Boss" }]);
    expect(doc.content![0]).toEqual({ type: "entityEmbed", attrs: { entityType: "monster", entityId: "m-1", startsPage: false } });
  });

  it("emits an embed of the named type", () => {
    const doc = markdownToScriptoriumContent("::: embed\ntype: npc\nname: Bram\n:::", {
      resolveEmbed: () => ({ id: "n-7" }),
    });
    expect(doc.content![0]).toEqual({ type: "entityEmbed", attrs: { entityType: "npc", entityId: "n-7", startsPage: false } });
  });

  it("leaves a stat block placeholder when the entity is not there", () => {
    for (const options of [undefined, { resolveEmbed: () => null }]) {
      const doc = markdownToScriptoriumContent("::: statblock\nname: Goblin Boss\n:::", options);
      expect(doc.content![0].type).toBe("noteBlock");
      expect(textOf(doc.content![0])).toBe("Stat block: Goblin Boss (not yet in the campaign)");
    }
  });

  it("leaves a placeholder for an embed of an unknown type, without asking the resolver", () => {
    let asked = false;
    const doc = markdownToScriptoriumContent("::: embed\ntype: dragon\nname: Vex\n:::", {
      resolveEmbed: () => {
        asked = true;
        return { id: "x" };
      },
    });
    expect(asked).toBe(false);
    expect(textOf(doc.content![0])).toBe("Embed: Vex (not yet in the campaign)");
  });

  it("emits nothing for a directive that names no entity", () => {
    expect(types(markdownToScriptoriumContent("::: statblock\ncr: 3\n:::"))).toEqual(["paragraph"]);
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

describe("::: cover", () => {
  it("builds a front cover with every text set and the picture resolved like an art slot", () => {
    const md = "::: cover front\ntitle: Sothery\nsubtitle: A Campaign Setting\nimage: art/cover.png\n:::";
    const doc = markdownToScriptoriumContent(md, { resolveArt: (slot) => (slot.existing === "art/cover.png" ? { src: "https://cdn/x.webp" } : null) });
    expect(doc.content![0]).toEqual({
      type: "coverPage",
      attrs: {
        variant: "front", title: "Sothery", subtitle: "A Campaign Setting", partNumber: "", blurb1: "", blurb2: "", blurb3: "",
        tagline: "", productUrl: "", backgroundImage: "https://cdn/x.webp", titleScrim: true,
      },
    });
  });

  it("makes a back cover with blurbs, and never a template placeholder", () => {
    const doc = markdownToScriptoriumContent("::: cover back\nblurb1: One.\ntagline: Stay.\nscrim: false\n:::");
    const attrs = doc.content![0].attrs!;
    expect(attrs.variant).toBe("back");
    expect(attrs.blurb1).toBe("One.");
    expect(attrs.productUrl).toBe("");
    expect(attrs.title).toBe("");
    expect(attrs.titleScrim).toBe(false);
  });

  it("falls back to a front cover with no picture when the variant or image is unknown", () => {
    const attrs = markdownToScriptoriumContent("::: cover sideways\ntitle: T\nimage: missing.png\n:::", { resolveArt: () => null }).content![0].attrs!;
    expect(attrs.variant).toBe("front");
    expect(attrs.backgroundImage).toBe("");
  });
});

