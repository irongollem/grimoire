import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const U1 = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => {
      if (table === "character_spells") {
        const b: Promise<unknown> & Record<string, unknown> = Object.assign(
          Promise.resolve({
            data: [
              { id: "r1", spell_id: "srd_fireball" },
              { id: "r2", spell_id: U1 },
              { id: "r3", spell_id: "gone" },
            ],
            error: null,
          }),
          {} as Record<string, unknown>,
        );
        for (const m of ["select", "eq", "order"]) b[m] = () => b;
        return b;
      }
      return {
        select: () => ({
          in: (_c: string, ids: string[]) =>
            Promise.resolve({
              data: ids.filter((i) => (table === "spells" ? i === U1 : i === "srd_fireball"))
                .map((id) => ({ id, name: `${table}:${id}`, level: 3 })),
              error: null,
            }),
        }),
      };
    },
  },
}));

import { useCharacterSpellsWithDetails } from "@/composables/party/useCharacterSpells";

describe("useCharacterSpellsWithDetails", () => {
  it("joins library and custom spells, null for an unknown id", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let result!: ReturnType<typeof useCharacterSpellsWithDetails>;
    mount(
      defineComponent({
        setup() {
          result = useCharacterSpellsWithDetails("pm-1");
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    );
    await flushPromises();
    const rows = result.data.value ?? [];
    expect(rows.map((r) => r.spell?.name ?? null)).toEqual(["library_spells:srd_fireball", "spells:" + U1, null]);
    expect(rows[0].spell?.user_id).toBe("");
  });
});
