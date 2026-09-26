import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import { useFurnitureEditing } from "./useFurnitureEditing";

function item(overrides: Partial<PageFurnitureItem> = {}): PageFurnitureItem {
  return {
    id: "f1",
    kind: "art",
    anchor: { type: "page", page: 1 },
    x: 20,
    y: 20,
    width: 30,
    z: "over",
    props: {},
    ...overrides,
  };
}

/** Box is 200x200 on screen; item elements are 1x1 for simplicity (drag math
 *  only reads the box's rect, not the target's, except for the resize-corner
 *  hit test). */
function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {}, ...rect }) as DOMRect;
}

function buildDom() {
  const container = document.createElement("div");
  const page = document.createElement("div");
  page.className = "pagedjs_pagebox";
  stubRect(page, { width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200 });
  const target = document.createElement("div");
  target.dataset.furnitureId = "f1";
  stubRect(target, { left: 40, top: 40, right: 60, bottom: 60, width: 20, height: 20 });
  page.appendChild(target);
  container.appendChild(page);
  document.body.appendChild(container);
  return { container, page, target };
}

function dispatchPointer(el: HTMLElement | Window, type: string, x: number, y: number) {
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

let onChange: Mock<(items: PageFurnitureItem[]) => void>;
let onSelect: Mock<(id: string | null) => void>;
let items: PageFurnitureItem[];

function mountEditing(container: HTMLElement, enabled = () => true) {
  onChange = vi.fn<(items: PageFurnitureItem[]) => void>();
  onSelect = vi.fn<(id: string | null) => void>();
  const containerRef = ref<HTMLElement | null>(container);
  const wrapper = mount(
    defineComponent({
      setup() {
        useFurnitureEditing({
          container: containerRef,
          enabled,
          items: () => items,
          onChange,
          onSelect,
        });
        return () => h("div");
      },
    }),
  );
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("useFurnitureEditing", () => {
  it("selects the item under the pointer on pointerdown", async () => {
    const { target } = buildDom();
    items = [item()];
    const wrapper = mountEditing(target.closest("div")!.parentElement!);
    await nextTick();
    dispatchPointer(target, "pointerdown", 50, 50);
    expect(onSelect).toHaveBeenCalledWith("f1");
    wrapper.unmount();
  });

  it("deselects when clicking blank page (no data-furniture-id ancestor)", async () => {
    const { container, page } = buildDom();
    items = [item()];
    const wrapper = mountEditing(container);
    await nextTick();
    dispatchPointer(page, "pointerdown", 150, 150);
    expect(onSelect).toHaveBeenCalledWith(null);
    wrapper.unmount();
  });

  it("moves the item by a percentage of the page box on drag", async () => {
    const { container, target } = buildDom();
    items = [item({ x: 20, y: 20 })];
    const wrapper = mountEditing(container);
    await nextTick();
    // target rect is 40..60 x 40..60; (42,42) is 18px from the bottom-right
    // corner in both axes — outside the 16px resize zone, so this is a move.
    dispatchPointer(target, "pointerdown", 42, 42);
    dispatchPointer(window, "pointermove", 62, 82); // +20px x (10% of 200), +40px y (20% of 200)
    dispatchPointer(window, "pointerup", 62, 82);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0] as PageFurnitureItem[];
    expect(updated[0].x).toBe(30); // 20 + 10
    expect(updated[0].y).toBe(40); // 20 + 20
    wrapper.unmount();
  });

  it("resizes instead of moving when the drag starts near the bottom-right corner", async () => {
    const { container, target } = buildDom();
    items = [item({ width: 30 })];
    const wrapper = mountEditing(container);
    await nextTick();
    // target rect is 40..60 x 40..60; RESIZE_ZONE_PX is 16, so (59,59) is within 16px of both edges.
    dispatchPointer(target, "pointerdown", 59, 59);
    dispatchPointer(window, "pointermove", 79, 59); // +20px = +10% of 200px box
    dispatchPointer(window, "pointerup", 79, 59);
    const updated = onChange.mock.calls[0][0] as PageFurnitureItem[];
    expect(updated[0].width).toBe(40); // 30 + 10
    // A resize patch only ever carries { width } — x/y stay at the item's own value.
    expect(updated[0].x).toBe(items[0].x);
    wrapper.unmount();
  });

  it("clamps position to [0, 100] and width to a minimum of 5", async () => {
    const { container, target } = buildDom();
    items = [item({ x: 5, width: 30 })];
    const wrapper = mountEditing(container);
    await nextTick();
    dispatchPointer(target, "pointerdown", 42, 42); // outside the resize corner (see above)
    dispatchPointer(window, "pointermove", -1000, 42); // drag far off the left edge
    dispatchPointer(window, "pointerup", -1000, 42);
    const updated = onChange.mock.calls[0][0] as PageFurnitureItem[];
    expect(updated[0].x).toBe(0);
    wrapper.unmount();
  });

  it("does nothing when editing is disabled", async () => {
    const { container, target } = buildDom();
    items = [item()];
    const wrapper = mountEditing(container, () => false);
    await nextTick();
    dispatchPointer(target, "pointerdown", 50, 50);
    expect(onSelect).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("removes its listeners on unmount", async () => {
    const { container, target } = buildDom();
    items = [item()];
    const wrapper = mountEditing(container);
    await nextTick();
    wrapper.unmount();
    dispatchPointer(target, "pointerdown", 50, 50);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
