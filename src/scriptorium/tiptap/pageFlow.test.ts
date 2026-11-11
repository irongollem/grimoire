// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow, gapHeights, pageAt, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import type { ChapterFlow, FlowBreak } from "@/scriptorium/lib/pageFlow/types";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

// Block ids are assigned just after creation, so wait for them before using any.
async function makeEditor(html: string): Promise<Editor> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ed = new Editor({ element: el, content: html, extensions: [...createScriptoriumExtensions(), PageFlow] });
  await vi.waitFor(() => {
    if (blockIds(ed).some((id) => id === "undefined" || id === "null")) throw new Error("ids not assigned yet");
  });
  return ed;
}

function blockIds(ed: Editor): string[] {
  return (ed.getJSON().content ?? []).map((n) => String(n.attrs?.blockId));
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

function flowOf(breaks: FlowBreak[], twoColumn = false, layoutClasses: ChapterFlow["layoutClasses"] = {}): ChapterFlow {
  return { chapterId: "c", pageCount: 2, twoColumn, breaks, layoutClasses };
}

async function setFlow(ed: Editor, flow: ChapterFlow | null) {
  ed.commands.setChapterFlow(flow);
  await flush();
}

/** The author's text in the paragraph before the first gap/colbreak widget in it. */
function textBeforeWidget(ed: Editor, selector: string): string {
  const w = ed.view.dom.querySelector(selector);
  const p = w?.closest("p");
  if (!w || !p) throw new Error(`no ${selector} widget inside a paragraph`);
  let out = "";
  for (const child of Array.from(p.childNodes)) {
    if (child === w) break;
    out += child.textContent;
  }
  return out;
}

describe("pageFlow decorations", () => {
  it("a break inside a paragraph lands at the character the page printed, not before the paragraph", async () => {
    editor = await makeEditor("<p>Hello world</p>");
    const [id] = blockIds(editor);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: id, textOffset: 6 } }]));
    expect(textBeforeWidget(editor, ".sc-flow-gap")).toBe("Hello ");
  });

  it("text inside a contenteditable=false label is not counted", async () => {
    // The label's characters are chrome; counting them would push the break 5 characters late.
    editor = await makeEditor("<p>Hello world</p>");
    const [id] = blockIds(editor);
    const p = editor.view.dom.querySelector("p");
    const label = document.createElement("span");
    label.contentEditable = "false";
    label.textContent = "LABEL";
    p?.insertBefore(label, p.firstChild);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: id, textOffset: 6 } }]));
    const gap = editor.view.dom.querySelector(".sc-flow-gap");
    let before = "";
    for (const c of Array.from(gap?.closest("p")?.childNodes ?? [])) {
      if (c === gap) break;
      if (c !== label) before += c.textContent;
    }
    expect(before).toBe("Hello ");
  });

  it("an offset past the block's text falls back to a gap before the block", async () => {
    editor = await makeEditor("<p>one</p><p>two</p>");
    const ids = blockIds(editor);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: ids[1], textOffset: 99 } }]));
    const gap = editor.view.dom.querySelector(".sc-flow-gap");
    expect(gap?.parentElement).toBe(editor.view.dom);
    expect(gap?.nextElementSibling?.textContent).toBe("two");
  });

  it("an unknown block id drops the break", async () => {
    editor = await makeEditor("<p>one</p>");
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: "gone", textOffset: 0 } }]));
    expect(editor.view.dom.querySelector(".sc-flow-gap")).toBeNull();
  });

  it("a page-end column break sits before the next page gap", async () => {
    editor = await makeEditor("<p>one</p><p>two</p>");
    const ids = blockIds(editor);
    await setFlow(
      editor,
      flowOf(
        [
          { kind: "page", page: 2, at: { blockId: ids[1], textOffset: 0 } },
          { kind: "column", page: 1, at: "page-end" },
        ],
        true,
      ),
    );
    const gap = editor.view.dom.querySelector(".sc-flow-gap");
    expect(gap?.previousElementSibling?.classList.contains("sc-flow-colbreak")).toBe(true);
  });

  it("a page-end column break on the last page goes to the end of the document", async () => {
    editor = await makeEditor("<p>one</p>");
    await setFlow(editor, flowOf([{ kind: "column", page: 1, at: "page-end" }], true));
    const kids = Array.from(editor.view.dom.children);
    const col = kids.findIndex((c) => c.classList.contains("sc-flow-colbreak"));
    const tail = kids.findIndex((c) => c.classList.contains("sc-flow-tail"));
    expect(col).toBeGreaterThan(kids.findIndex((c) => c.tagName === "P"));
    expect(col).toBeLessThan(tail);
  });

  it("typing before a break keeps the gap on the same text", async () => {
    // Without mapping the gap would stay at its old number and drift into "world".
    editor = await makeEditor("<p>Hello world</p>");
    const [id] = blockIds(editor);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: id, textOffset: 6 } }]));
    editor.commands.insertContentAt(1, "XXX");
    expect(textBeforeWidget(editor, ".sc-flow-gap")).toBe("XXXHello ");
  });

  it("setChapterFlow(null) removes the gaps and the two-column classes", async () => {
    editor = await makeEditor("<p>one</p><p>two</p>");
    const ids = blockIds(editor);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: ids[1], textOffset: 0 } }], true));
    expect(editor.view.dom.classList.contains("phb-two-col")).toBe(true);
    expect(editor.view.dom.querySelector(".sc-flow-gap")).not.toBeNull();
    await setFlow(editor, null);
    expect(editor.view.dom.classList.contains("phb-two-col")).toBe(false);
    expect(editor.view.dom.querySelector(".sc-flow-gap, .sc-flow-tail, .sc-flow-colbreak")).toBeNull();
    expect((editor.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow.pages).toEqual([]);
  });

  it("a block the preview reshaped takes the same class here, and nothing else the flow names does", async () => {
    // Without it, a table the preview sets across both columns wraps in one column here.
    editor = await makeEditor("<p>Intro</p><p>Caption</p>");
    const [first, second] = blockIds(editor);
    await setFlow(editor, flowOf([], true, { [first]: ["sc-table--span"], [second]: ["sc-flow-float-end", "evil-class"] }));
    const [p1, p2] = Array.from(editor.view.dom.querySelectorAll("p"));
    expect(p1.classList.contains("sc-table--span")).toBe(true);
    expect(p2.classList.contains("sc-flow-float-end")).toBe(true);
    expect(p2.classList.contains("evil-class")).toBe(false);
  });

  it("a one-column flow does not turn on the column classes", async () => {
    editor = await makeEditor("<p>one</p>");
    await setFlow(editor, flowOf([]));
    expect(editor.view.dom.classList.contains("phb-two-col")).toBe(false);
  });
});

describe("gapHeights", () => {
  const g = { contentHeight: 1000, marginTop: 50, marginBottom: 60, sheetGap: 24 };

  it("fills the rest of the text area, then the margins and the sheet gap", () => {
    expect(gapHeights([700, 400], g).gaps).toEqual([300 + 60 + 24 + 50]);
  });

  it("never goes negative when a page overflows its text area", () => {
    const { gaps, tail } = gapHeights([1006, 1010], g);
    expect(gaps).toEqual([60 + 24 + 50]);
    expect(tail).toBe(0);
  });

  it("the tail fills the last page only", () => {
    expect(gapHeights([1000, 250], g).tail).toBe(750);
  });
});

describe("pageAt", () => {
  const pages = [
    { page: 1, startPos: 0, contentTop: 0, contentHeight: 1 },
    { page: 2, startPos: 40, contentTop: 0, contentHeight: 1 },
  ];
  it("is the last page starting at or before the position", () => {
    expect(pageAt(pages, 39)?.page).toBe(1);
    expect(pageAt(pages, 40)?.page).toBe(2);
  });
});
