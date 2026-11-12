// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { generateJSON } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { detachedEntryBreakAt } from "@/scriptorium/tiptap/detachedEntry";

const ENTRY = `<div class="sc-statblock-entry sc-statblock-entry--wide" data-band-position="top">
<h2 class="sc-statblock-entry-heading">Marzipan Sentry</h2>
<div class="sc-statblock-entry-body">
<div class="sc-statblock-entry-block">
<div class="sc-statblock sc-statblock--wide">
<p class="sc-statblock-name">Marzipan Sentry</p>
<div class="sc-statblock-rule"></div>
<p class="sc-statblock-type"><em>Medium Construct</em></p>
<p class="sc-statblock-prop sc-statblock-acinit"><span><strong>AC</strong> 16</span><span><strong>Initiative</strong> −1 (9)</span></p>
<table class="sc-ability-table sc-ability-table--2024"><thead><tr><th class="sc-abil-name sc-abil-physical">Str</th><th class="sc-abil-gap"></th></tr></thead><tbody><tr><td class="sc-abil-name sc-abil-physical">10</td><td class="sc-abil-gap"></td></tr></tbody></table>
<div class="sc-statblock-section"><h4 class="sc-statblock-section-title">Actions</h4><p>Slam.</p></div>
</div>
</div>
<div class="sc-statblock-entry-aside"><img src="https://x.test/a.webp" class="sc-entity-art sc-entity-art--cutout" data-art-kind="cutout" alt="Sentry" />
<div class="sc-statblock-entry-lore"><p>Lore.</p></div></div>
</div>
</div>`;

function editorWith(html: string): Editor {
  return new Editor({ extensions: createScriptoriumExtensions(), content: html });
}

describe("a detached entry keeps its look", () => {
  it("keeps every class, the band position, the art and the two AC/Initiative spans as they were", () => {
    const editor = editorWith(ENTRY);
    const out = document.createElement("div");
    out.innerHTML = editor.getHTML();

    const entry = out.querySelector("div.sc-statblock-entry.sc-statblock-entry--wide");
    expect(entry?.getAttribute("data-band-position")).toBe("top");
    for (const sel of [
      "h2.sc-statblock-entry-heading",
      "div.sc-statblock-entry-body",
      "div.sc-statblock-entry-block",
      "div.sc-statblock.sc-statblock--wide",
      "p.sc-statblock-name",
      "div.sc-statblock-rule",
      "p.sc-statblock-type",
      "p.sc-statblock-prop.sc-statblock-acinit",
      "table.sc-ability-table.sc-ability-table--2024",
      "th.sc-abil-name.sc-abil-physical",
      "td.sc-abil-gap",
      "div.sc-statblock-section",
      "h4.sc-statblock-section-title",
      "div.sc-statblock-entry-aside",
      "div.sc-statblock-entry-lore",
    ]) {
      expect(out.querySelector(sel), sel).not.toBeNull();
    }
    expect(out.querySelector("div.sc-statblock-rule")?.childNodes.length).toBe(0);

    const art = out.querySelector("img.sc-entity-art.sc-entity-art--cutout");
    expect(art?.getAttribute("data-art-kind")).toBe("cutout");
    expect(art?.getAttribute("src")).toBe("https://x.test/a.webp");
    expect(art?.getAttribute("alt")).toBe("Sentry");
    expect(art?.getAttribute("style")).toBeNull();

    const acinit = out.querySelector("p.sc-statblock-acinit");
    const spans = Array.from(acinit?.children ?? []);
    expect(spans.map((s) => s.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(spans[0].innerHTML).toBe("<strong>AC</strong> 16");
    expect(spans[1].innerHTML).toBe("<strong>Initiative</strong> −1 (9)");
    editor.destroy();
  });

  it("leaves the words ordinary editable text, not an atom", () => {
    const editor = editorWith(ENTRY);
    let atoms = 0;
    editor.state.doc.descendants((node) => {
      if (node.isAtom && node.type.name !== "entryArt" && !node.isText) atoms++;
    });
    expect(atoms).toBe(0);
    const name = editor.getJSON();
    expect(JSON.stringify(name)).toContain('"text":"Slam."');
    editor.destroy();
  });

  it("keeps an ability coin's spans inside the coin, not wrapped in a paragraph", () => {
    const editor = editorWith(
      '<div class="sc-coin"><span class="sc-coin-label">STR</span><span class="sc-coin-save" data-label="Save">+2</span></div>',
    );
    const out = document.createElement("div");
    out.innerHTML = editor.getHTML();
    expect(out.querySelector(".sc-coin > p")).toBeNull();
    expect(out.querySelector(".sc-coin > span.sc-coin-save")?.getAttribute("data-label")).toBe("Save");
    editor.destroy();
  });

  it("drops a class that is not an sc- class when HTML is pasted", () => {
    const editor = editorWith(
      '<div class="evil sc-keep"><p class="big sc-x">hi</p><span class="evil"><b>b</b></span></div>',
    );
    const html = editor.getHTML();
    expect(html).not.toContain("evil");
    expect(html).not.toContain("big");
    expect(html).toContain("sc-keep");
    expect(html).toContain('class="sc-x"');
    editor.destroy();
  });

  it("does not wrap an ordinary pasted span", () => {
    const editor = editorWith("<p>plain <span>word</span></p>");
    expect(editor.getHTML()).not.toContain("<span");
    editor.destroy();
  });

  it("still parses a read-aloud block as the read-aloud node, not a classed div", () => {
    const json = generateJSON(
      '<div data-type="descriptiveBlock" class="sc-descriptive"><p>Read</p></div>',
      createScriptoriumExtensions(),
    );
    expect(json.content?.[0]?.type).toBe("descriptiveBlock");
  });
});

describe("pieces other nodes own are left to them", () => {
  // Fails on: the classed div or span taking an image wrapper or a spacer, so wrapped pictures and spacers vanish on paste.
  it("an image's own wrapper and a spacer still parse as theirs", () => {
    const ext = createScriptoriumExtensions();
    const wrapped = generateJSON('<div class="sc-img-wrap sc-img-wrap--wrapLeft"><img src="https://x.test/a.webp"></div>', ext);
    expect(wrapped.content?.[0]?.type).toBe("image");
    const spacer = generateJSON('<p><span data-type="spacer-h" class="sc-spacer-h"></span></p>', ext);
    expect(spacer.content?.[0]?.content?.[0]?.type).toBe("spacerHorizontal");
  });
});

describe("detachedEntryBreakAt", () => {
  // Fails on: a detached monster that used to start its own page running on from the page before,
  // which moved every later page (The Locked Workshop went from 27 pages to 26).
  function docOf(html: string): { ed: Editor; entryPos: number } {
    const ed = new Editor({ element: document.createElement("div"), content: html, extensions: createScriptoriumExtensions() });
    let entryPos = -1;
    ed.state.doc.forEach((n, offset) => {
      if (entryPos < 0 && n.type.name === "classedBlock") entryPos = offset;
    });
    return { ed, entryPos };
  }
  const ENTRY = '<div class="sc-statblock-entry"><p class="sc-statblock-name">Sentry</p></div>';

  it("breaks the page right before the entry", () => {
    const { ed, entryPos } = docOf(`<p>Before</p>${ENTRY}`);
    expect(detachedEntryBreakAt(ed.state.doc, entryPos)).toBe(entryPos);
    ed.destroy();
  });
  it("breaks before a level-two heading right above it, so the heading goes with it", () => {
    const { ed, entryPos } = docOf(`<p>Before</p><h2>Constructs</h2>${ENTRY}`);
    const heading = ed.state.doc.child(1);
    expect(detachedEntryBreakAt(ed.state.doc, entryPos)).toBe(entryPos - heading.nodeSize);
    ed.destroy();
  });
  it("adds nothing at the start of the document or right after a page break", () => {
    const first = docOf(ENTRY);
    expect(detachedEntryBreakAt(first.ed.state.doc, first.entryPos)).toBeNull();
    first.ed.destroy();
    const afterBreak = docOf(`<p>Before</p><div data-type="page-break"></div>${ENTRY}`);
    expect(detachedEntryBreakAt(afterBreak.ed.state.doc, afterBreak.entryPos)).toBeNull();
    afterBreak.ed.destroy();
  });
});
