import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { RunCombatant } from "@/types/encounter.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ campaignId: "campaign-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

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

/** Mounts inside a real component so `useQuery` has a client to attach to. */
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

const mini = (over: Record<string, unknown> = {}) => ({
  campaign_id: "campaign-1",
  source_table: "monsters",
  source_id: "mon-1",
  format: "vtt",
  status: "ready",
  thumbnail_url: "https://cdn.example/orc.png",
  stylized_image_url: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  fake.reset();
  mocks.campaignId = "campaign-1";
});

describe("useCombatantMinis", () => {
  const orc = () => [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];

  it("maps a combatant's instance_id to its source's mini portrait", async () => {
    fake.seed("minis", [mini()]);
    const { api } = open(orc());
    await flushPromises();
    expect(api().value.get("m-orc-0")).toBe("https://cdn.example/orc.png");
  });

  // Which format and status count is combatantPortraitOverrides' rule (its own test); the scope is this read's.
  it("never takes a portrait from another campaign's mini of the same source", async () => {
    fake.seed("minis", [mini({ campaign_id: "campaign-2", thumbnail_url: "https://cdn.example/other-campaign.png" })]);
    const { api } = open(orc());
    await flushPromises();
    expect(api().value.size).toBe(0);
  });

  it("reads nothing, and returns no portraits, while no campaign is active", async () => {
    mocks.campaignId = null;
    fake.seed("minis", [mini()]);
    const { api } = open(orc());
    await flushPromises();
    expect(api().value.size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  it("returns no portraits, rather than throwing, when the read fails", async () => {
    fake.seed("minis", [mini()]);
    fake.failNext("minis", { message: "boom" });
    const { api } = open(orc());
    await flushPromises();
    expect(api().value.size).toBe(0);
  });

  it("reacts to the combatants list changing without a new query", async () => {
    fake.seed("minis", [mini()]);
    const { api, combatantsRef } = open([]);
    await flushPromises();
    expect(api().value.size).toBe(0);

    combatantsRef.value = orc();
    await flushPromises();

    expect(api().value.get("m-orc-0")).toBe("https://cdn.example/orc.png");
    expect(fake.calls).toHaveLength(1);
  });
});
