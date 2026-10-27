import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const U1 = "11111111-1111-4111-8111-111111111111";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { useCharacterSpellsWithDetails } from "@/composables/party/useCharacterSpells";

function open(memberId: string | null) {
  let result!: ReturnType<typeof useCharacterSpellsWithDetails>;
  mount(
    defineComponent({
      setup() {
        result = useCharacterSpellsWithDetails(ref(memberId));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return result;
}

beforeEach(() => {
  fake.reset();
  fake.seed("library_spells", [{ id: "srd_fireball", name: "Fireball", level: 3 }]);
  fake.seed("spells", [{ id: U1, name: "Homebrew Bolt", level: 1 }]);
  fake.seed("character_spells", [
    { id: "r1", party_member_id: "pm-1", spell_id: "srd_fireball", created_at: "2026-10-01T00:00:00Z" },
    { id: "r2", party_member_id: "pm-1", spell_id: U1, created_at: "2026-10-02T00:00:00Z" },
    { id: "r3", party_member_id: "pm-1", spell_id: "gone", created_at: "2026-10-03T00:00:00Z" },
    { id: "other", party_member_id: "pm-2", spell_id: "srd_fireball", created_at: "2026-10-01T00:00:00Z" },
  ]);
});

describe("useCharacterSpellsWithDetails", () => {
  it("lists this character's spells in the order learned, joining library and custom spells, null for an unknown id", async () => {
    const result = open("pm-1");
    await flushPromises();
    const rows = result.data.value ?? [];
    expect(rows.map((r) => [r.id, r.spell?.name ?? null])).toEqual([
      ["r1", "Fireball"],
      ["r2", "Homebrew Bolt"],
      ["r3", null],
    ]);
    // A library spell has no owner.
    expect(rows[0].spell?.user_id).toBe("");
    expect(rows[2].spell).toBeNull();
  });

  it("reads nothing before a character is chosen", async () => {
    open(null);
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("reports a failed read instead of an empty spell list", async () => {
    fake.failNext("character_spells", { message: "boom" });
    const result = open("pm-1");
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
  });
});
