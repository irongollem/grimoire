// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { Previewer } from "pagedjs";
import { pagedStyleElements, removePagedStyles } from "./pagedStyles";

function style(text: string): HTMLStyleElement {
  const el = document.createElement("style");
  el.textContent = text;
  document.head.appendChild(el);
  return el;
}

function fakePreviewer(styleEl: HTMLStyleElement | undefined, inserted: HTMLStyleElement[]): Previewer {
  return { polisher: { styleEl, inserted } } as unknown as Previewer;
}

describe("pagedStyles", () => {
  afterEach(() => document.head.replaceChildren());

  it("returns only one previewer's styles, in the head's order, while another render adds its own", () => {
    const base = style(".base {}");
    const sheet = style(".sheet {}");
    const othersPreview = style(".live-preview {}"); // the live preview, mid-export
    const rules = style(".rules {}");
    const export_ = fakePreviewer(rules, [base, sheet]);

    expect(pagedStyleElements(export_)).toEqual([base, sheet, rules]);

    removePagedStyles(export_);
    expect(Array.from(document.head.querySelectorAll("style"))).toEqual([othersPreview]);
  });

  it("copes with a previewer that failed before it created its rules element", () => {
    const base = style(".base {}");
    const failed = fakePreviewer(undefined, [base]);
    expect(pagedStyleElements(failed)).toEqual([base]);
    removePagedStyles(failed);
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });
});
