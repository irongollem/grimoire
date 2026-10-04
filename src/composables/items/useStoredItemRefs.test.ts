import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Item } from "@/types/item.types";

const mocks = vi.hoisted(() => ({ calls: [] as { table: string; ids: string[] }[] }));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          mocks.calls.push({ table, ids });
          return Promise.resolve({ data: ids.map((id) => ({ id, name: id })), error: null });
        },
      }),
    }),
  },
}));
// The real module pulls in stores and the catalogue hooks; only the row mapper is needed here.
vi.mock("@/composables/items/useItems", () => ({
  normalizeLibraryItem: (row: Record<string, unknown>) => ({ ...row, user_id: "" }),
}));

import { missingLibraryIds, useStoredItemRefs } from "./useStoredItemRefs";

const UUID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  mocks.calls.length = 0;
});

describe("missingLibraryIds", () => {
  it("returns library ids the known list cannot resolve, deduped and sorted", () => {
    const known = new Set(["srd_a_torch"]);
    expect(missingLibraryIds(["srd_z_rope", "srd_a_torch", "srd_z_rope", "srd_b_lamp"], known)).toEqual([
      "srd_b_lamp",
      "srd_z_rope",
    ]);
  });

  it("never fetches uuids, those are own items", () => {
    expect(missingLibraryIds([UUID], new Set())).toEqual([]);
  });
});

describe("useStoredItemRefs (#972)", () => {
  it("without a source, resolves the named ids with one by-id read per table and no catalogue read", async () => {
    const { find, items } = run(() => useStoredItemRefs(() => [UUID, "srd_rope"]));
    await flushPromises();
    expect(mocks.calls.slice().sort((a, b) => a.table.localeCompare(b.table))).toEqual([
      { table: "items", ids: [UUID] },
      { table: "library_items", ids: ["srd_rope"] },
    ]);
    expect(items.value.map((i) => i.id).sort()).toEqual([UUID, "srd_rope"].sort());
    expect(find("srd_rope")?.id).toBe("srd_rope");
  });

  it("with a source, keeps it and fetches only the library ids it lacks", async () => {
    const source = ref<Item[] | undefined>([{ id: UUID, name: "Held" } as Item]);
    const { find } = run(() => useStoredItemRefs(() => [UUID, "srd_rope"], source));
    await flushPromises();
    expect(mocks.calls).toEqual([{ table: "library_items", ids: ["srd_rope"] }]);
    expect(find(UUID)?.name).toBe("Held");
    expect(find("srd_rope")).toBeDefined();
  });
});
