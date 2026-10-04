import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({ calls: [] as { table: string; ops: [string, unknown[]][] }[] }));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      mocks.calls.push(call);
      const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
        Promise.resolve({ data: [], error: null }),
        {} as Record<string, unknown>,
      );
      for (const m of ["select", "eq", "in", "or", "order"]) {
        b[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          if (m === "in") {
            const ids = args[1] as string[];
            return Promise.resolve({ data: ids.map((id) => ({ id, name: id })), error: null });
          }
          return b;
        };
      }
      return b;
    },
  },
}));

import { useItemsByIds, splitItemIds } from "@/composables/items/useItemsByIds";

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
  mocks.calls.length = 0;
});

describe("splitItemIds", () => {
  it("splits by id shape, dedupes, sorts and drops nulls", () => {
    expect(splitItemIds([UUID_B, "srd_z", null, UUID_A, "srd_a", "srd_z"])).toEqual({
      libraryIds: ["srd_a", "srd_z"],
      customIds: [UUID_A, UUID_B],
    });
  });
});

describe("useItemsByIds (#972)", () => {
  it("reads library ids from library_items and uuids from items, with no other filter", async () => {
    const { data } = run(() => useItemsByIds([UUID_A, "srd_rope"]));
    await flushPromises();
    expect(mocks.calls.map((c) => c.table).sort()).toEqual(["items", "library_items"]);
    for (const c of mocks.calls) expect(c.ops.map(([m]) => m).sort()).toEqual(["in", "select"]);
    expect(data.value.get(UUID_A)?.name).toBe(UUID_A);
    expect(data.value.get("srd_rope")?.user_id).toBe("");
  });

  it("sends nothing for an empty list", async () => {
    run(() => useItemsByIds([]));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
  });

  it("chunks at 100 ids", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `srd_${String(i).padStart(3, "0")}`);
    run(() => useItemsByIds(ids));
    await flushPromises();
    const sizes = mocks.calls.map((c) => {
      const op = c.ops.find(([m]) => m === "in");
      return op ? (op[1][1] as string[]).length : 0;
    });
    expect(sizes).toEqual([100, 100, 30]);
  });

  it("is order independent in its cache key", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const mountWith = (ids: string[]) =>
      mount(defineComponent({ setup() { useItemsByIds(ids); return () => h("div"); } }), {
        global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
      });
    mountWith(["srd_a", "srd_b"]);
    await flushPromises();
    mountWith(["srd_b", "srd_a"]);
    await flushPromises();
    expect(mocks.calls).toHaveLength(1);
  });

  it("sends nothing while disabled", async () => {
    run(() => useItemsByIds(["srd_a"], () => ({ enabled: false })));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
  });
});

