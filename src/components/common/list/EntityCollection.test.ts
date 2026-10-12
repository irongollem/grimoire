import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import EntityCollection from "./EntityCollection.vue";

// VirtualGrid needs layout jsdom lacks; a stub that renders every item and
// exposes the props it was given is enough to pin what EntityCollection decides.
vi.mock("@/components/common/list/VirtualGrid.vue", () => ({
  default: {
    props: ["items", "itemKey", "columns", "estimateRowHeight", "gap"],
    template: `<div data-vg :data-columns="columns" :data-estimate="estimateRowHeight" :data-gap="gap">
      <template v-for="(item, i) in items" :key="itemKey(item)"><slot :item="item" :index="i" /></template>
    </div>`,
  },
}));

const items = [{ id: "a" }, { id: "b" }];

function mountIt(layout: "rows" | "grid", extra: Record<string, unknown> = {}) {
  return mount(EntityCollection, {
    props: { items, itemKey: (item: unknown) => JSON.stringify(item), layout, gridColumns: 3, gridRowEstimate: 250, ...extra },
    slots: {
      card: `<template #card="{ item }"><b class="card">{{ item.id }}</b></template>`,
      row: `<template #row="{ item }"><i class="row">{{ item.id }}</i></template>`,
    },
  });
}

describe("EntityCollection", () => {
  it("renders the card slot in grid layout with the grid columns, estimate and gap", () => {
    const w = mountIt("grid");
    expect(w.findAll(".card")).toHaveLength(2);
    expect(w.findAll(".row")).toHaveLength(0);
    const vg = w.get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("3");
    expect(vg.attributes("data-estimate")).toBe("250");
    expect(vg.attributes("data-gap")).toBe("0.75");
  });

  it("renders the row slot in rows layout, one column by default", () => {
    const w = mountIt("rows");
    expect(w.findAll(".row")).toHaveLength(2);
    expect(w.findAll(".card")).toHaveLength(0);
    const vg = w.get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("1");
    expect(vg.attributes("data-estimate")).toBe("98");
    expect(vg.attributes("data-gap")).toBe("0.5");
  });

  it("honours rowEstimate and rowColumns", () => {
    const vg = mountIt("rows", { rowEstimate: 82, rowColumns: 2 }).get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("2");
    expect(vg.attributes("data-estimate")).toBe("82");
  });
});
