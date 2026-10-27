import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Item } from "@/types/item.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { fetchItemsByIds, resolveItemById, useItemsByIds, splitItemIds } from "@/composables/items/useItemsByIds";

const UUID_A = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const UUID_B = "4f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

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
  fake.seed("library_items", [
    { id: "srd_rope", name: "Rope" },
    { id: "srd_lamp", name: "Lamp" },
  ]);
  fake.seed("items", [
    { id: UUID_A, name: "Moonblade", user_id: "owner" },
    { id: UUID_B, name: "Not Asked For", user_id: "owner" },
  ]);
});

/** How many ids one `in` filter carried. */
const idCount = (value: unknown): number => (Array.isArray(value) ? value.length : -1);

describe("splitItemIds", () => {
  it("splits by id shape, dedupes, sorts and drops nulls", () => {
    expect(splitItemIds([UUID_B, "srd_z", null, UUID_A, "srd_a", "srd_z"])).toEqual({
      libraryIds: ["srd_a", "srd_z"],
      customIds: [UUID_A, UUID_B],
    });
  });
});

describe("useItemsByIds (#972)", () => {
  it("resolves library ids from library_items and uuids from items, and only the ones named", async () => {
    const { data } = run(() => useItemsByIds([UUID_A, "srd_rope"]));
    await flushPromises();
    expect([...data.value.keys()].sort()).toEqual([UUID_A, "srd_rope"].sort());
    expect(data.value.get(UUID_A)?.name).toBe("Moonblade");
    // A library row has no owner: it is shared content.
    expect(data.value.get("srd_rope")?.user_id).toBe("");
  });

  it("reads a long list in chunks of at most 100 ids and loses none of them", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `srd_${String(i).padStart(3, "0")}`);
    fake.seed("library_items", ids.map((id) => ({ id, name: id })));
    const { data } = run(() => useItemsByIds(ids));
    await flushPromises();
    expect(data.value.size).toBe(230);
    // The request itself is the property here: a URL with every id in it is refused.
    const sizes = fake.calls.filter((c) => c.op === "select").map((c) => idCount(c.filters[0]?.value));
    expect(sizes.sort((a, b) => a - b)).toEqual([30, 100, 100]);
  });

  it("sends nothing while disabled", async () => {
    run(() => useItemsByIds(["srd_rope"], () => ({ enabled: false })));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });
});

describe("fetchItemsByIds", () => {
  it("reads the rows for the given ids, ignores null ids, and reads nothing for none", async () => {
    expect((await fetchItemsByIds(["srd_rope", null])).map((i) => i.id)).toEqual(["srd_rope"]);
    fake.calls.length = 0;
    expect(await fetchItemsByIds([])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("fails on a failed read instead of answering with no items", async () => {
    fake.failNext("library_items", { message: "boom" });
    await expect(fetchItemsByIds(["srd_rope"])).rejects.toMatchObject({ message: "boom" });
  });
});

describe("resolveItemById", () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it("answers from the known map without a request", async () => {
    const hit = { id: "srd_rope", name: "From the map" } as Item;
    expect((await resolveItemById(client(), new Map([["srd_rope", hit]]), "srd_rope"))?.name).toBe("From the map");
    expect(fake.calls).toEqual([]);
  });

  it("reads an id the map does not hold yet, once, and caches it", async () => {
    const qc = client();
    expect((await resolveItemById(qc, new Map(), "srd_lamp"))?.id).toBe("srd_lamp");
    await resolveItemById(qc, new Map(), "srd_lamp");
    expect(fake.calls).toHaveLength(1);
  });

  it("resolves undefined for an id with no row, and throws for a failed read", async () => {
    expect(await resolveItemById(client(), new Map(), "srd_missing")).toBeUndefined();
    fake.failNext("library_items", { message: "boom" });
    await expect(resolveItemById(client(), new Map(), "srd_rope")).rejects.toMatchObject({ message: "boom" });
  });
});
