import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

type Call = { table: string; column: string; values: string[] };
const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; column: string; values: string[] }>,
  gate: null as Promise<void> | null,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (column: string, values: string[]) => {
          mocks.calls.push({ table, column, values });
          const result = {
            data: values.map((id) => ({ id, name: `${table}:${id}`, level: 1 })),
            error: null,
          };
          return mocks.gate ? mocks.gate.then(() => result) : Promise.resolve(result);
        },
      }),
    }),
  },
}));

import { fetchSpellsByIds, useSpellsByIds } from "@/composables/spells/useSpellsByIds";

const U1 = "11111111-1111-4111-8111-111111111111";
const callsFor = (table: string): Call[] => mocks.calls.filter((c) => c.table === table);

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.gate = null;
});

describe("fetchSpellsByIds", () => {
  it("sends nothing for no ids", async () => {
    const map = await fetchSpellsByIds([]);
    expect(map.size).toBe(0);
    expect(mocks.calls).toEqual([]);
  });

  it("tries every id on the library and only uuids on custom spells", async () => {
    const map = await fetchSpellsByIds(["srd_fireball", U1]);
    expect(callsFor("library_spells")[0].values).toEqual([U1, "srd_fireball"]);
    expect(callsFor("spells")[0].values).toEqual([U1]);
    expect(map.get("srd_fireball")?.user_id).toBe("");
    // the custom row wins on a shared id and keeps its own shape
    expect(map.get(U1)?.name).toBe(`spells:${U1}`);
  });

  it("sends no custom request when no id is a uuid", async () => {
    await fetchSpellsByIds(["srd_fireball"]);
    expect(callsFor("spells")).toEqual([]);
  });

  it("chunks at 100", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `srd_${String(i).padStart(3, "0")}`);
    const map = await fetchSpellsByIds(ids);
    expect(callsFor("library_spells").map((c) => c.values.length)).toEqual([100, 100, 30]);
    expect(map.size).toBe(230);
  });
});

describe("useSpellsByIds", () => {
  function run(ids: string[] | (() => string[])) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let result!: ReturnType<typeof useSpellsByIds>;
    mount(
      defineComponent({
        setup() {
          result = useSpellsByIds(typeof ids === "function" ? ids : () => ids);
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    );
    return { result, queryClient };
  }

  it("shows library and own spells together, the own row winning a shared id", async () => {
    const { result } = run(["srd_a", U1]);
    await flushPromises();
    expect([...result.data.value.keys()].sort()).toEqual([U1, "srd_a"].sort());
    expect(result.data.value.get("srd_a")?.user_id).toBe("");
    expect(result.data.value.get(U1)?.name).toBe(`spells:${U1}`);
  });
});
