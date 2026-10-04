import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  log: [] as Array<{ table: string; op: string; args: unknown[] }>,
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
      Promise.resolve({ data: mocks.rows[table] ?? [], error: null }),
      {} as Record<string, unknown>,
    );
    mocks.log.push({ table, op: "from", args: [] });
    for (const m of ["select", "eq", "in", "or", "order", "range"]) {
      b[m] = (...args: unknown[]) => {
        mocks.log.push({ table, op: m, args });
        return b;
      };
    }
    return b;
  };
  return { getCurrentUser: () => ({ id: "user-1" }), supabase: { from: builder } };
});
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));

import { useSpellIndex } from "@/composables/spells/useSpellIndex";

function run(getOptions?: () => { enabled?: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useSpellIndex>;
  mount(
    defineComponent({
      setup() {
        result = useSpellIndex(getOptions);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { result, queryClient };
}
const ops = (table: string, op: string) => mocks.log.filter((l) => l.table === table && l.op === op);

beforeEach(() => {
  mocks.log.length = 0;
  mocks.rows = {};
});

describe("useSpellIndex", () => {
  it("reads slim columns, scopes custom spells by campaign and never by user", async () => {
    run();
    await flushPromises();
    expect(ops("library_spells", "select")[0].args[0]).toBe("id, name, level, school, source, classes");
    expect(ops("spells", "select")[0].args[0]).toBe("id, name, level, school, source, classes, campaign_id");
    expect(ops("spells", "or").map((o) => o.args[0])).toEqual([
      "ruleset.is.null,ruleset.eq.2024",
      "campaign_id.is.null,campaign_id.eq.camp-1",
    ]);
    expect(ops("spells", "eq").map((o) => o.args)).toEqual([["open5e_import", false]]);
    expect(mocks.log.some((l) => l.args[0] === "user_id")).toBe(false);
  });

  it("merges library and custom rows sorted by level then name", async () => {
    mocks.rows = {
      library_spells: [
        { id: "srd_b", name: "Bless", level: 1, school: "enchantment", source: "srd-2024", classes: [] },
        { id: "srd_a", name: "Light", level: 0, school: "evocation", source: "srd-2024", classes: [] },
      ],
      spells: [
        { id: "c1", name: "Alarm", level: 1, school: "abjuration", source: null, classes: [], campaign_id: "camp-1" },
      ],
    };
    const { result } = run();
    await flushPromises();
    expect(result.data.value?.map((s) => s.id)).toEqual(["srd_a", "c1", "srd_b"]);
    expect(result.data.value?.map((s) => s.is_shared)).toEqual([true, false, true]);
    expect(result.data.value?.[1].campaign_id).toBe("camp-1");
  });

  it("sends nothing when disabled", async () => {
    const { result } = run(() => ({ enabled: false }));
    await flushPromises();
    expect(mocks.log).toEqual([]);
    expect(result.data.value).toBeUndefined();
  });

  it("keys the library cache outside the library-spells prefix", async () => {
    const { queryClient } = run();
    await flushPromises();
    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey[0]);
    expect(keys).toContain("library-spell-index");
    expect(keys).not.toContain("library-spells");
  });
});
