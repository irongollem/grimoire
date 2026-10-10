import { mount, flushPromises } from "@vue/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import VirtualGrid from "./VirtualGrid.vue";

// jsdom has no layout: give the scroller (the document, in the absence of any
// overflow ancestor) an 800px viewport and every row a fixed height.
const ORIGINAL = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this === document.documentElement ? 800 : 100;
    },
  });
});
afterAll(() => {
  if (ORIGINAL) Object.defineProperty(HTMLElement.prototype, "offsetHeight", ORIGINAL);
});

const items = Array.from({ length: 500 }, (_, i) => ({ id: i }));

function mountGrid(columns: number) {
  return mount(VirtualGrid<{ id: number }>, {
    props: { items, itemKey: (i) => i.id, columns, estimateRowHeight: 100, gap: 0 },
    slots: { default: `<template #default="{ item, index }"><i class="cell" :data-i="index">{{ item.id }}</i></template>` },
  });
}

describe("VirtualGrid", () => {
  it("mounts only the rows near the viewport", async () => {
    const wrapper = mountGrid(2);
    await flushPromises();
    const cells = wrapper.findAll(".cell");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(60);
    expect(cells[0]!.attributes("data-i")).toBe("0");
  });

  it("keeps the full list's height so a sentinel after it sits at the true end", async () => {
    const wrapper = mountGrid(2);
    await flushPromises();
    // 250 rows of 100px
    expect((wrapper.element as HTMLElement).style.height).toBe("25000px");
  });

  it("lays a row out as `columns` equal tracks and numbers items across rows", async () => {
    const wrapper = mountGrid(3);
    await flushPromises();
    const row = wrapper.find("[data-index='1']");
    expect((row.element as HTMLElement).style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(row.findAll(".cell").map((c) => c.attributes("data-i"))).toEqual(["3", "4", "5"]);
  });
});
