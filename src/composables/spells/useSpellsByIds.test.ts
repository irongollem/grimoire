import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: fake.client,
}));

import { fetchSpellsByIds, useSpellsByIds } from "@/composables/spells/useSpellsByIds";

const U1 = "11111111-1111-4111-8111-111111111111";
const reads = (table: string) => fake.calls.filter((c) => c.target === table);

beforeEach(() => fake.reset());

describe("fetchSpellsByIds", () => {
  it("sends nothing for no ids", async () => {
    const map = await fetchSpellsByIds([]);
    expect(map.size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  // Ids are opaque: a custom spell is only ever a uuid, so a non-uuid id must
  // never be looked up there. The seeded custom row below shares its id with a
  // library spell and would win if it were.
  it("finds library spells by any id, and custom spells only by uuid", async () => {
    fake.seed("library_spells", [{ id: "srd_fireball", name: "Fireball" }, { id: U1, name: "Library twin" }]);
    fake.seed("spells", [{ id: "srd_fireball", name: "Not a uuid" }, { id: U1, name: "Mine", user_id: "user-1" }]);
    const map = await fetchSpellsByIds(["srd_fireball", U1]);
    expect(map.get("srd_fireball")).toMatchObject({ name: "Fireball", user_id: "" });
    // the custom row wins on a shared id and keeps its own shape
    expect(map.get(U1)).toMatchObject({ name: "Mine", user_id: "user-1" });
  });

  it("does not ask the custom table at all when no id is a uuid", async () => {
    await fetchSpellsByIds(["srd_fireball"]);
    expect(reads("spells")).toEqual([]);
  });

  it("chunks at 100 and loses no id", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `srd_${String(i).padStart(3, "0")}`);
    fake.seed("library_spells", ids.map((id) => ({ id, name: id })));
    const map = await fetchSpellsByIds(ids);
    expect(reads("library_spells")).toHaveLength(3);
    expect(map.size).toBe(230);
  });

  it("throws a failed read instead of returning the spells it did get", async () => {
    fake.failNext("library_spells", { message: "boom" });
    await expect(fetchSpellsByIds(["srd_fireball"])).rejects.toMatchObject({ message: "boom" });
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
    fake.seed("library_spells", [{ id: "srd_a", name: "A" }, { id: U1, name: "Twin" }]);
    fake.seed("spells", [{ id: U1, name: "Mine" }]);
    const { result } = run(["srd_a", U1]);
    await flushPromises();
    expect([...result.data.value.keys()].sort()).toEqual([U1, "srd_a"].sort());
    expect(result.data.value.get("srd_a")?.user_id).toBe("");
    expect(result.data.value.get(U1)?.name).toBe("Mine");
  });
});
