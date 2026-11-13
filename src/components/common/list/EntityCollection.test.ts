import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import EntityCollection from "./EntityCollection.vue";
import { useLowArt } from "@/composables/useLowArt";

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
  it("renders the card slot in grid layout with the grid columns and estimate", () => {
    const w = mountIt("grid");
    expect(w.findAll(".card")).toHaveLength(2);
    expect(w.findAll(".row")).toHaveLength(0);
    const vg = w.get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("3");
    expect(vg.attributes("data-estimate")).toBe("250");
  });

  it("renders the row slot in rows layout, one column by default", () => {
    const w = mountIt("rows");
    expect(w.findAll(".row")).toHaveLength(2);
    expect(w.findAll(".card")).toHaveLength(0);
    const vg = w.get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("1");
    // Rows do not use the grid's estimate (250) or its column count (3).
    expect(vg.attributes("data-estimate")).not.toBe("250");
  });

  it("honours rowEstimate and rowColumns", () => {
    const vg = mountIt("rows", { rowEstimate: 82, rowColumns: 2 }).get("[data-vg]");
    expect(vg.attributes("data-columns")).toBe("2");
    expect(vg.attributes("data-estimate")).toBe("82");
  });

  describe("low art ledger", () => {
    const ledger = [{ label: "Type", track: "8rem" }, { label: "CR", track: "3rem" }];
    afterEach(() => {
      useLowArt().setLowArt(false);
    });

    it("draws the column heads once on one sheet at 41 px lines", () => {
      useLowArt().setLowArt(true);
      const w = mountIt("rows", { ledger });
      const head = w.get("[data-ledger-head]");
      expect(head.text()).toContain("Type");
      expect(head.text()).toContain("CR");
      expect(w.findAll("[data-ledger-head]")).toHaveLength(1);
      expect(w.get("[data-vg]").attributes("data-estimate")).toBe("41");
      expect(w.get("[data-vg]").attributes("data-gap")).toBe("0");
    });

    // Bug: a list out of scope (notes, sessions) turns into a ledger.
    it("keeps plain rows when the list names no ledger", () => {
      useLowArt().setLowArt(true);
      const w = mountIt("rows");
      expect(w.find("[data-ledger-head]").exists()).toBe(false);
      expect(w.get("[data-vg]").attributes("data-estimate")).toBe("98");
    });

    // Bug: the ledger shows outside low art.
    it("draws no heads with low art off", () => {
      const w = mountIt("rows", { ledger });
      expect(w.find("[data-ledger-head]").exists()).toBe(false);
    });

    // Bug: low art reflows the minis or Book Nook grid.
    it("leaves a grid without a ledger untouched in low art", () => {
      useLowArt().setLowArt(true);
      const vg = mountIt("grid").get("[data-vg]");
      expect(vg.attributes("data-columns")).toBe("3");
      expect(vg.attributes("data-estimate")).toBe("250");
    });

    // Bug: low art keeps the portrait grid's column count and card height.
    it("ignores the grid columns and estimate in low art grids with a ledger", () => {
      useLowArt().setLowArt(true);
      const vg = mountIt("grid", { ledger }).get("[data-vg]");
      expect(vg.attributes("data-estimate")).toBe("130");
      expect(vg.attributes("data-columns")).not.toBe("3");
    });
  });
});
