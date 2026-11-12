// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyEntryFit, readPrintedEntryFits } from "./entryFit";

function printed(entryAttrs: string, art = '<img class="sc-entity-art" style="max-height: 96px">') {
  const host = document.createElement("div");
  host.innerHTML = `<div data-type="entity-embed" data-block-id="b1"><div class="sc-statblock-entry ${entryAttrs}"><div class="sc-statblock sc-statblock--column"></div>${art}</div></div>`;
  return host;
}

describe("readPrintedEntryFits", () => {
  // Fails on: the editor never learning what the printer did to an entry, so it draws it taller than its page.
  it("reads the size, art height, margin and split the printer gave an entry", () => {
    const host = printed("sc-statblock-entry--wide sc-statblock-entry--split");
    host.querySelector<HTMLElement>(".sc-statblock-entry")!.style.marginBottom = "0px";
    expect(readPrintedEntryFits(host).get("b1")).toEqual({
      size: "wide",
      artMaxHeight: "96px",
      marginBottom: "0px",
      split: true,
    });
  });

  // Fails on: a split entry's second fragment overwriting the fit read from its first.
  it("reads the first fragment of an entry the printer split over two pages", () => {
    const host = printed("sc-statblock-entry--column");
    host.insertAdjacentHTML(
      "beforeend",
      '<div data-type="entity-embed" data-block-id="b1"><div class="sc-statblock-entry sc-statblock-entry--wide"></div></div>',
    );
    expect(readPrintedEntryFits(host).get("b1")?.size).toBe("column");
  });
});

describe("applyEntryFit", () => {
  // Fails on: the editor's entry keeping its full-height art and column size after the printer shrank and widened it.
  it("gives the editor's entry the printed size, art height and margin", () => {
    const root = printed("sc-statblock-entry--column");
    applyEntryFit(root, { size: "wide", artMaxHeight: "120px", marginBottom: "0px", split: false });
    const entry = root.querySelector<HTMLElement>(".sc-statblock-entry")!;
    expect(entry.classList.contains("sc-statblock-entry--wide")).toBe(true);
    expect(entry.classList.contains("sc-statblock-entry--column")).toBe(false);
    expect(root.querySelector(".sc-statblock")?.classList.contains("sc-statblock--wide")).toBe(true);
    expect(entry.style.marginBottom).toBe("0px");
    expect(root.querySelector<HTMLElement>("img")!.style.maxHeight).toBe("120px");
  });

  // Fails on: an entry the printer left alone being given a blank art height or margin.
  it("leaves an entry the printer did not touch as it is", () => {
    const root = printed("sc-statblock-entry--column", "<img class=\"sc-entity-art\">");
    applyEntryFit(root, { size: null, artMaxHeight: "", marginBottom: "", split: false });
    expect(root.querySelector<HTMLElement>("img")!.getAttribute("style")).toBeNull();
    expect(root.querySelector(".sc-statblock-entry")?.classList.contains("sc-statblock-entry--column")).toBe(true);
  });
});
