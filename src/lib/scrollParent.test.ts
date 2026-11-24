// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollParentOf, scrollWithin } from "./scrollParent";

/** Builds nested divs outermost-first, each with an overflow and a height. */
function nest(levels: { overflowY: string; height: number }[]): HTMLElement {
  let parent: HTMLElement = document.body;
  const made: HTMLElement[] = [];
  for (const level of levels) {
    const div = document.createElement("div");
    div.style.overflowY = level.overflowY;
    Object.defineProperty(div, "clientHeight", { value: level.height, configurable: true });
    parent.appendChild(div);
    made.push(div);
    parent = div;
  }
  const leaf = document.createElement("div");
  parent.appendChild(leaf);
  return leaf;
}

describe("scrollParentOf", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("skips an auto-overflow wrapper that grows with its content, for the bounded scroller outside it", () => {
    // <main overflow-y:auto, 724px> > <wrapper overflow-y:auto, 56,527px> > list
    const leaf = nest([
      { overflowY: "auto", height: 724 },
      { overflowY: "auto", height: 56527 },
    ]);
    const main = document.body.firstElementChild;
    expect(scrollParentOf(leaf)).toBe(main);
  });

  it("returns the nearest when it is bounded", () => {
    const leaf = nest([
      { overflowY: "auto", height: 724 },
      { overflowY: "scroll", height: 300 },
    ]);
    expect(scrollParentOf(leaf)).toBe(leaf.parentElement);
  });

  it("counts a scroller exactly as tall as the window as bounded", () => {
    const leaf = nest([
      { overflowY: "auto", height: window.innerHeight },
      { overflowY: "auto", height: 99999 },
    ]);
    // The nearest scroller grows with its content, so the one around it, exactly as tall as the window, is the real one.
    expect(scrollParentOf(leaf)).toBe(leaf.parentElement?.parentElement);
  });

  it("falls back to the nearest when nothing is bounded, and null when nothing overflows", () => {
    const tall = nest([{ overflowY: "auto", height: 99999 }]);
    expect(scrollParentOf(tall)).toBe(tall.parentElement);
    document.body.innerHTML = "";
    expect(scrollParentOf(nest([{ overflowY: "visible", height: 100 }]))).toBeNull();
  });
});

describe("scrollWithin", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  /** The app shell (hidden overflow, never meant to move) around the page's own scroller, around a row. */
  function shell() {
    const leaf = nest([{ overflowY: "hidden", height: 900 }, { overflowY: "auto", height: 600 }]);
    const scroller = leaf.parentElement!;
    const outer = scroller.parentElement!;
    Object.defineProperty(scroller, "scrollTop", { value: 100, configurable: true });
    scroller.getBoundingClientRect = () => rect(50, 600);
    leaf.getBoundingClientRect = () => rect(850, 40);
    scroller.scrollTo = vi.fn() as typeof scroller.scrollTo;
    outer.scrollTo = vi.fn() as typeof outer.scrollTo;
    leaf.scrollIntoView = vi.fn();
    return { leaf, scroller, outer };
  }

  // Bug (24 Nov 2026): the Canon page's backstory link used scrollIntoView, which also scrolled the app shell, and the
  // docked soundboard deck rose into the middle of the page.
  it("scrolls the row's own scroller and nothing further out", () => {
    const { leaf, scroller, outer } = shell();
    scrollWithin(leaf, { block: "start" });
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "auto" });
    expect(outer.scrollTo).not.toHaveBeenCalled();
    expect(leaf.scrollIntoView).not.toHaveBeenCalled();
  });

  // Bug: "nearest" scrolled a row that was already in view, or put a row below the fold at the top.
  it("moves a row below the fold just enough, and a row in view not at all", () => {
    const { leaf, scroller } = shell();
    scrollWithin(leaf, { block: "nearest" });
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 340, behavior: "auto" });
    leaf.getBoundingClientRect = () => rect(200, 40);
    (scroller.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    scrollWithin(leaf, { block: "nearest" });
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });

  // Bug (24 Nov 2026): opening a backstory (an entry taller than the page) lined its bottom up with the page's, so the
  // page leapt to the entry's end and its title and its ledger went off the top.
  it("never pushes the top of an entry taller than the page out of view", () => {
    const { leaf, scroller } = shell();
    // Starts 100px below the scroller's top and runs 1200px, past its bottom: only those 100px may move.
    leaf.getBoundingClientRect = () => rect(150, 1200);
    scrollWithin(leaf, { block: "nearest" });
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: "auto" });
  });
});
