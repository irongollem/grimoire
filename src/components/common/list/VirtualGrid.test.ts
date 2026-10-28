import { mount, flushPromises } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { describe, expect, it, vi } from "vitest";
import VirtualGrid from "./VirtualGrid.vue";

// jsdom has no layout; see the helper for what this stands in for.
useVirtualGridViewport({ viewportPx: 800, itemPx: 100 });

const items = Array.from({ length: 500 }, (_, i) => ({ id: i }));

function mountGrid(columns: number, extra: Record<string, unknown> = {}) {
  return mount(VirtualGrid<{ id: number }>, {
    props: { items, itemKey: (i) => i.id, columns, estimateRowHeight: 100, gap: 0, ...extra },
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

  it("adds the row gap (in rem) between rows to the full height", async () => {
    // 250 rows of 100px with 249 gaps of 0.5rem; the document font size in the test DOM is 16px.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const wrapper = mountGrid(2, { gap: 0.5 });
    await flushPromises();
    expect(parseFloat((wrapper.element as HTMLElement).style.height)).toBeCloseTo(250 * 100 + 249 * 0.5 * rem);
  });

  it("mounts more rows past the viewport edge the larger the overscan", async () => {
    const few = mountGrid(1, { overscan: 0 });
    const many = mountGrid(1, { overscan: 6 });
    await flushPromises();
    expect(many.findAll(".cell").length - few.findAll(".cell").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps four rows beyond the viewport mounted by default", async () => {
    const byDefault = mountGrid(1);
    const four = mountGrid(1, { overscan: 4 });
    const none = mountGrid(1, { overscan: 0 });
    await flushPromises();
    expect(byDefault.findAll(".cell")).toHaveLength(four.findAll(".cell").length);
    expect(byDefault.findAll(".cell").length - none.findAll(".cell").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps a row's element when items before it are removed, so a card is not rebuilt because the list shifted", async () => {
    const wrapper = mountGrid(2);
    await flushPromises();
    const rowWithItemTwo = wrapper.find("[data-index='1']").element;
    expect(wrapper.find("[data-index='1'] .cell").text()).toBe("2");

    await wrapper.setProps({ items: items.slice(2) });
    await flushPromises();

    expect(wrapper.find("[data-index='0'] .cell").text()).toBe("2");
    expect(wrapper.find("[data-index='0']").element).toBe(rowWithItemTwo);
  });

  it("stops listening for window resizes when it goes away", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const wrapper = mountGrid(2);
    await flushPromises();
    wrapper.unmount();
    expect(remove.mock.calls.some(([type]) => type === "resize")).toBe(true);
    remove.mockRestore();
  });
});
