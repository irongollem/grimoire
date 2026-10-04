import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

type Call = { table: string; column: string; values: string[] };
const mocks = vi.hoisted(() => ({ calls: [] as Array<{ table: string; column: string; values: string[] }> }));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (column: string, values: string[]) => {
          mocks.calls.push({ table, column, values });
          return Promise.resolve({
            data: values.map((id) => ({ id, name: `${table}:${id}`, level: 1 })),
            error: null,
          });
        },
      }),
    }),
  },
}));

import { fetchSpellsByIds, useSpellsByIds } from "@/composables/spells/useSpellsByIds";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const callsFor = (table: string): Call[] => mocks.calls.filter((c) => c.table === table);

beforeEach(() => {
  mocks.calls.length = 0;
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
  function run(ids: string[]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let result!: ReturnType<typeof useSpellsByIds>;
    mount(
      defineComponent({
        setup() {
          result = useSpellsByIds(() => ids);
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    );
    return { result, queryClient };
  }

  it("sends nothing and returns an empty map for no ids", async () => {
    const { result } = run([]);
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(result.data.value.size).toBe(0);
  });

  it("is order independent: the same ids reuse one cache entry", async () => {
    const a = run([U2, "srd_a", U1]);
    await flushPromises();
    const b = run([U1, U2, "srd_a"]);
    await flushPromises();
    expect(a.result.data.value.size).toBe(3);
    expect(b.result.data.value.size).toBe(3);
    expect(a.queryClient.getQueryCache().getAll()[0].queryKey).toEqual(
      b.queryClient.getQueryCache().getAll()[0].queryKey,
    );
  });
});
