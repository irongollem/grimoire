// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { scrollParentOf } from "./scrollParent";

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

  it("falls back to the nearest when nothing is bounded, and null when nothing overflows", () => {
    const tall = nest([{ overflowY: "auto", height: 99999 }]);
    expect(scrollParentOf(tall)).toBe(tall.parentElement);
    document.body.innerHTML = "";
    expect(scrollParentOf(nest([{ overflowY: "visible", height: 100 }]))).toBeNull();
  });
});
