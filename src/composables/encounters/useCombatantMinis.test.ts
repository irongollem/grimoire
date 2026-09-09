import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { RunCombatant } from "@/types/encounter.types";

const mocks = vi.hoisted(() => ({
  campaignId: "campaign-1" as string | null,
  rows: [] as Record<string, unknown>[],
  lastFilters: [] as [string, unknown][],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => {
      mocks.lastFilters = [];
      // A real Promise instance with the chainable methods attached, rather
      // than a plain object carrying its own `then` — the query awaits the
      // builder directly, the way the real postgrest-js builder works.
      const builder = Object.assign(Promise.resolve({ data: mocks.rows, error: null }), {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          mocks.lastFilters.push([col, val]);
          return builder;
        }),
      });
      return builder;
    }),
  },
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return mocks.campaignId;
    },
  }),
}));

import { useCombatantMinis } from "./useCombatantMinis";

function combatant(overrides: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: "Test",
    faction_id: "hostile",
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...overrides,
  };
}

/** Mounts inside a real component so `useQuery` has a client to attach to —
 *  same helper shape as useUnembeddedContent.test.ts. */
function open(combatants: RunCombatant[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const combatantsRef = ref(combatants);
  let api!: ReturnType<typeof useCombatantMinis>;
  mount(
    defineComponent({
      setup() {
        api = useCombatantMinis(combatantsRef);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api, combatantsRef };
}

beforeEach(() => {
  mocks.campaignId = "campaign-1";
  mocks.rows = [];
  mocks.lastFilters = [];
});

describe("useCombatantMinis", () => {
  it("queries the minis table scoped to the active campaign, format vtt, status ready", async () => {
    open([combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })]);
    await flushPromises();

    expect(mocks.lastFilters).toContainEqual(["campaign_id", "campaign-1"]);
    expect(mocks.lastFilters).toContainEqual(["format", "vtt"]);
    expect(mocks.lastFilters).toContainEqual(["status", "ready"]);
  });

  it("maps a combatant's instance_id to its source's mini portrait", async () => {
    mocks.rows = [
      {
        source_table: "monsters",
        source_id: "mon-1",
        format: "vtt",
        status: "ready",
        thumbnail_url: "https://cdn.example/orc.png",
        stylized_image_url: null,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];
    const { api } = open([combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })]);
    await flushPromises();

    expect(api().value.get("m-orc-0")).toBe("https://cdn.example/orc.png");
  });

  it("returns an empty map before the query resolves and when no campaign is active", async () => {
    mocks.campaignId = null;
    const { api } = open([combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })]);
    await flushPromises();

    expect(api().value.size).toBe(0);
  });

  it("reacts to the combatants list changing without a new query", async () => {
    mocks.rows = [
      {
        source_table: "monsters",
        source_id: "mon-1",
        format: "vtt",
        status: "ready",
        thumbnail_url: "https://cdn.example/orc.png",
        stylized_image_url: null,
        created_at: "2026-09-01T00:00:00Z",
      },
    ];
    const { api, combatantsRef } = open([]);
    await flushPromises();
    expect(api().value.size).toBe(0);

    combatantsRef.value = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    await flushPromises();

    expect(api().value.get("m-orc-0")).toBe("https://cdn.example/orc.png");
  });
});
