import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Item } from "@/types/item.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
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
  fake.reset();
  fake.seed("library_items", [{ id: "srd_rope", name: "Rope" }, { id: "srd_unrelated", name: "Unrelated" }]);
  fake.seed("items", [{ id: UUID, name: "Moonblade" }]);
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
  it("without a source, resolves exactly the named ids from both tables, never the catalogue", async () => {
    const { find, items } = run(() => useStoredItemRefs(() => [UUID, "srd_rope"]));
    await flushPromises();
    expect(items.value.map((i) => i.id).sort()).toEqual([UUID, "srd_rope"].sort());
    expect(find("srd_rope")?.id).toBe("srd_rope");
    expect(find("srd_unrelated")).toBeUndefined();
    // The ids were read by the by-id hook; the stored-ref fallback has nothing left to fetch.
    expect(fake.calls.filter((c) => c.target === "library_items")).toHaveLength(1);
  });

  it("with a source, keeps it and fetches only the library ids it lacks", async () => {
    const source = ref<Item[] | undefined>([{ id: UUID, name: "Held" } as Item]);
    const { find, items } = run(() => useStoredItemRefs(() => [UUID, "srd_rope"], source));
    await flushPromises();
    expect(find(UUID)?.name).toBe("Held");
    expect(find("srd_rope")?.name).toBe("Rope");
    expect(items.value).toHaveLength(2);
    // The own item's uuid is never read from the base table for a source-backed caller.
    expect(fake.calls.some((c) => c.target === "items")).toBe(false);
  });
});
