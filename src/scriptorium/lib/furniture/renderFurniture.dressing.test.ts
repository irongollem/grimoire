// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderFurniture } from "./renderFurniture";
import { createFurnitureItem } from "./model";
import type { Dressing } from "@/scriptorium/dressing/dressing";

const mocks = vi.hoisted(() => ({ dressPage: vi.fn() }));
vi.mock("@/scriptorium/dressing/dressing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/scriptorium/dressing/dressing")>();
  mocks.dressPage.mockImplementation(actual.dressPage);
  return { ...actual, dressPage: mocks.dressPage };
});

const DRESSING: Dressing = {
  v: 1,
  seed: 5,
  stain: { on: true, strength: 0.6 },
  wash: { on: true, strength: 0.5 },
  corners: { on: true, strength: 0.8 },
};

const page = (attrs: string, inner = "<p>text</p>") =>
  `<div class="pagedjs_page" ${attrs}><div class="pagedjs_pagebox"><div class="pagedjs_area">${inner}</div></div></div>`;

/** A front cover, a text page, a blank page the layout left so the next chapter opens on a right-hand page, a text page. */
function book(): HTMLElement {
  const c = document.createElement("div");
  c.innerHTML =
    page('data-chapter-id="a" data-chapter-page="1"', '<div data-type="coverPage" data-variant="front"></div>') +
    page('data-chapter-id="a" data-chapter-page="2"') +
    page('data-chapter-id="a" data-blank-page=""') +
    page('data-chapter-id="b" data-chapter-page="1"');
  return c;
}

const boxes = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".pagedjs_pagebox")];
const dressed = (c: HTMLElement) => boxes(c).map((b) => b.querySelector(".sc-dressing") !== null);

beforeEach(() => mocks.dressPage.mockClear());

describe("renderFurniture page dressing", () => {
  it("dresses text pages only: a cover and a blank page stay bare", () => {
    // Fails on: stains over the cover art or the deliberately empty page.
    const c = book();
    renderFurniture(c, [], { dressing: DRESSING });
    expect(dressed(c)).toEqual([false, true, false, true]);
  });

  it("numbers each page by its place in the whole book, blank pages and covers counted, through the one placement function", () => {
    // Fails on: numbering by the page within its chapter (b's first page would be 1 here and 4 in the editor),
    // or a renderer placing marks without dressPage.
    renderFurniture(book(), [], { dressing: DRESSING, handout: false });
    expect(mocks.dressPage.mock.calls.map(([, n, kind]) => [n, kind])).toEqual([
      [1, "cover"],
      [2, "text"],
      [3, "blank"],
      [4, "text"],
    ]);
    expect(mocks.dressPage.mock.calls[1][3]).toMatchObject({ handout: false });
  });

  it("puts the dressing behind a picture that sits behind the text", () => {
    // Fails on: the stain painted over a background picture instead of under it.
    const c = book();
    const item = createFurnitureItem("art", { type: "page", chapterId: "a", page: 2 }, { z: "under", props: { src: "a.png" } });
    renderFurniture(c, [item], { dressing: DRESSING });
    const kids = [...boxes(c)[1].children].map((e) => e.className.split(" ")[0]);
    expect(kids.indexOf("sc-dressing")).toBe(0);
    expect(kids.indexOf("sc-furniture")).toBeGreaterThan(0);
  });

  it("draws once however often it runs, and none when the dressing goes", () => {
    // Fails on: a second layer stacked on each re-draw (the preview re-draws furniture in place), doubling the ink.
    const c = book();
    renderFurniture(c, [], { dressing: DRESSING });
    renderFurniture(c, [], { dressing: DRESSING });
    expect(c.querySelectorAll(".sc-dressing")).toHaveLength(2);
    renderFurniture(c, [], { dressing: null });
    expect(c.querySelectorAll(".sc-dressing")).toHaveLength(0);
  });

  it("draws nothing when no dressing is given", () => {
    const c = book();
    renderFurniture(c, []);
    expect(c.querySelectorAll(".sc-dressing")).toHaveLength(0);
    expect(mocks.dressPage).not.toHaveBeenCalled();
  });

  it("treats an inside or part cover as a cover too", () => {
    const c = document.createElement("div");
    c.innerHTML = page('data-chapter-id="a" data-chapter-page="1"', '<div data-type="coverPage" data-variant="inside"></div>');
    renderFurniture(c, [], { dressing: DRESSING });
    expect(c.querySelector(".sc-dressing")).toBeNull();
  });
});
