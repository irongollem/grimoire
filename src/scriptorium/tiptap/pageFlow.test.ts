// @vitest-environment happy-dom
import { undoDepth } from "@tiptap/pm/history";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow, gapHeights, offsetWithin, pageAt, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
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

function flowOf(
  breaks: FlowBreak[],
  twoColumn = false,
  layoutClasses: ChapterFlow["layoutClasses"] = {},
  pushedFloats: ChapterFlow["pushedFloats"] = [],
): ChapterFlow {
  const footers = [
    { shown: true, recto: true, label: "14", title: "The Understage" },
    { shown: false, recto: false, label: null, title: "" },
  ];
  return { chapterId: "c", pageCount: 2, footers, twoColumn, breaks, layoutClasses, pushedFloats };
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

describe("a picture the printer pushes on", () => {
  const IMG = '<img src="https://example.com/a.png" data-layout-mode="wrapLeft">';

  async function withPushed(): Promise<{ ed: Editor; imageId: string; paragraphId: string }> {
    const ed = await makeEditor(`<p>Intro text</p>${IMG}<p>The paragraph beside the picture.</p>`);
    editor = ed;
    const ids = blockIds(ed);
    const flow = flowOf([], true, {}, [{ imageBlockId: ids[1], paragraphBlockId: ids[2], page: 1 }]);
    await setFlow(ed, flow);
    return { ed, imageId: ids[1], paragraphId: ids[2] };
  }

  it("keeps a pushed picture with its text from the next layout on, and draws no note", async () => {
    // Bug caught: the picture stays pushed away from its paragraph, which the editor cannot show,
    // so the page the DM writes on and the page that prints differ.
    const { ed, imageId } = await withPushed();
    const img = (ed.getJSON().content ?? []).find((n) => n.attrs?.blockId === imageId);
    expect(img?.attrs?.keepWithText).toBe(true);
    expect(ed.view.dom.querySelector(".sc-flow-pushed")).toBeNull();
  });

  it("the layout's change is not a step the writer can undo", async () => {
    // Bug caught: Undo reverts the layout's own change first, and the next layout sets it again.
    const ed = await makeEditor(`<p>Intro text</p>${IMG}<p>The paragraph beside the picture.</p>`);
    editor = ed;
    const ids = blockIds(ed);
    const depth = undoDepth(ed.state);
    await setFlow(ed, flowOf([], true, {}, [{ imageBlockId: ids[1], paragraphBlockId: ids[2], page: 1 }]));
    expect((ed.getJSON().content ?? [])[1]?.attrs?.keepWithText).toBe(true);
    expect(undoDepth(ed.state)).toBe(depth);
  });

  it("leaves a picture the DM set not to keep with its text to the printer", async () => {
    const ed = await makeEditor(`<p>Intro text</p><img src="https://example.com/a.png" data-layout-mode="wrapLeft" data-keep-with-text="false"><p>Beside.</p>`);
    editor = ed;
    const ids = blockIds(ed);
    await setFlow(ed, flowOf([], true, {}, [{ imageBlockId: ids[1], paragraphBlockId: ids[2], page: 1 }]));
    const img = (ed.getJSON().content ?? []).find((n) => n.attrs?.blockId === ids[1]);
    expect(img?.attrs?.keepWithText).toBe(false);
  });

  it("touches no picture when nothing is pushed", async () => {
    editor = await makeEditor(`<p>Intro</p>${IMG}<p>Body</p>`);
    await setFlow(editor, flowOf([], true));
    const img = (editor.getJSON().content ?? []).find((n) => n.type === "image");
    expect(img?.attrs?.keepWithText).toBeNull();
  });
});

describe("page footers (#1176 story 6)", () => {
  const twoPages = async () => {
    editor = await makeEditor("<p>one</p><p>two</p>");
    const ids = blockIds(editor);
    await setFlow(editor, flowOf([{ kind: "page", page: 2, at: { blockId: ids[1], textOffset: 0 } }]));
    return editor;
  };
  const slots = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll<HTMLElement>(".sc-flow-footer"));
  const storageOf = (ed: Editor) => (ed.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow;
  const press = (el: Element) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

  it("draws each page's printed footer: page 1's before page 2, the last page's after the text", async () => {
    // Bug caught: a footer drawn from the wrong page's record (off by one) shows the next page's number on this sheet.
    const ed = await twoPages();
    await vi.waitFor(() => expect(slots(ed)[0].dataset.page).toBe("1"));
    const [first, last] = slots(ed);
    expect(first.closest(".sc-flow-gap")).not.toBeNull();
    expect(first.querySelector(".sc-footer-text")?.textContent).toBe("The Understage");
    expect(first.querySelector(".sc-footer-num")?.textContent).toBe("14");
    expect(last.closest(".sc-flow-tail")).not.toBeNull();
    expect(last.dataset.page).toBe("2");
    expect(last.classList.contains("sc-flow-footer--none")).toBe(true);
    expect(last.textContent).toBe("No footer");
  });

  it("a footer press selects it, and the text, a key or Escape lets it go", async () => {
    // Bug caught: a footer that stays selected after the DM goes back to writing keeps the panel on it.
    const ed = await twoPages();
    await vi.waitFor(() => expect(slots(ed)[0].dataset.page).toBe("1"));
    const seen = vi.fn();
    storageOf(ed).listeners.add(seen);
    const press1 = press(slots(ed)[0]);
    expect(press1).toBe(false); // default prevented: the editor keeps its selection and focus
    expect(storageOf(ed).footer).toBe(1);
    expect(slots(ed)[0].classList.contains("is-selected")).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);

    press(ed.view.dom.querySelector("p") as Element);
    expect(storageOf(ed).footer).toBeNull();
    expect(slots(ed)[0].classList.contains("is-selected")).toBe(false);

    press(slots(ed)[1]);
    expect(storageOf(ed).footer).toBe(2);
    ed.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(storageOf(ed).footer).toBeNull();
  });

  // Fails on: a stopEvent written as (view, event), which ProseMirror calls with the event alone, so it
  // never matched and the editor handled every press on a footer as a press in the text.
  it("tells the editor to leave presses on a footer alone, and only those", async () => {
    const ed = await twoPages();
    await vi.waitFor(() => expect(slots(ed)[0].dataset.page).toBe("1"));
    const widgets: { spec: { stopEvent?: (event: Event) => boolean } }[] = [];
    ed.view.someProp("decorations", (f) => {
      f.call(ed.view, ed.state)?.forEachSet((set) => widgets.push(...(set.find() as unknown as typeof widgets)));
    });
    const gap = widgets.find((w) => typeof w.spec.stopEvent === "function");
    expect(gap).toBeDefined();
    const onFooter = new MouseEvent("mousedown");
    Object.defineProperty(onFooter, "target", { value: slots(ed)[0] });
    const elsewhere = new MouseEvent("mousedown");
    Object.defineProperty(elsewhere, "target", { value: ed.view.dom.querySelector("p") });
    expect(gap?.spec.stopEvent?.(onFooter)).toBe(true);
    expect(gap?.spec.stopEvent?.(elsewhere)).toBe(false);
  });

  it("drops the selection when the chapter's layout goes", async () => {
    const ed = await twoPages();
    await vi.waitFor(() => expect(slots(ed)[0].dataset.page).toBe("1"));
    press(slots(ed)[0]);
    await setFlow(ed, null);
    await vi.waitFor(() => expect(storageOf(ed).footer).toBeNull());
  });
});

describe("offsetWithin", () => {
  function box(el: HTMLElement, rect: { top: number; left: number; width: number }, props: Record<string, unknown>) {
    el.getBoundingClientRect = () => ({ ...rect, height: 0, right: 0, bottom: 0, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, configurable: true });
  }

  // Fails on: summing offsetTop through a block the page split in two, which put a page gap
  // ten thousand pixels down the chapter (the offsets count from the block's unsplit flow).
  it("reads a nested element where it is drawn, with the sheet's display scale divided out", () => {
    const root = document.createElement("div");
    const block = document.createElement("div");
    const gap = document.createElement("div");
    root.append(block);
    block.append(gap);
    // The sheet is drawn at half size: 794 px wide on the page, 397 px on screen.
    box(root, { top: 50, left: 20, width: 397 }, { offsetWidth: 794, clientTop: 0, clientLeft: 0 });
    box(block, { top: 60, left: 20, width: 397 }, { offsetParent: root, offsetTop: 20, offsetLeft: 0 });
    box(gap, { top: 150, left: 30, width: 100 }, { offsetParent: block, offsetTop: 9000, offsetLeft: 0 });
    expect(offsetWithin(gap, root)).toEqual({ top: 200, left: 20 });
  });

  it("reads a child of the root from its own offsets", () => {
    const root = document.createElement("div");
    const child = document.createElement("div");
    root.append(child);
    Object.defineProperty(child, "offsetParent", { value: root });
    Object.defineProperty(child, "offsetTop", { value: 812 });
    Object.defineProperty(child, "offsetLeft", { value: 40 });
    expect(offsetWithin(child, root)).toEqual({ top: 812, left: 40 });
  });
});
