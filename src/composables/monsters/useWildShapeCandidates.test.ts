import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import type { MonsterIndexEntry } from "@/types/monster.types";

const mocks = vi.hoisted(() => ({
  indexOptions: [] as { enabled?: boolean; sides?: string }[],
  index: [] as MonsterIndexEntry[],
  projection: [] as Record<string, unknown>[],
  projectionCalls: 0,
}));

vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: (getOptions?: () => { enabled?: boolean; sides?: string }) => {
    mocks.indexOptions.push(getOptions?.() ?? {});
    return { data: ref(mocks.index), isLoading: ref(false) };
  },
}));
vi.mock("@/composables/monsters/useMonsters", () => ({
  fetchPlayerVisibleMonsters: () => {
    mocks.projectionCalls += 1;
    return Promise.resolve(mocks.projection);
  },
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));

import { useWildShapeCandidates } from "./useWildShapeCandidates";
import { wildShapeRules } from "@/rules/wildshape";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";

const rules = wildShapeRules({ edition: "2024", druidLevel: 4, isCircleOfMoon: false, wisMod: 0 });

const entry = (id: string, name: string, over: Partial<MonsterIndexEntry> = {}): MonsterIndexEntry => ({
  id, name, monster_type: "beast", size: "medium", challenge_rating: "1/4", speed: "40 ft.", source: "x",
  source_title: null, image_url: null, portrait_focal_point: null, cutout_url: null, is_shared: true, campaign_id: null,
  ...over,
});

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pinia = createPinia();
  setActivePinia(pinia);
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  mocks.indexOptions.length = 0;
  mocks.projectionCalls = 0;
  mocks.index = [
    entry("srd_wolf", "Wolf", { challenge_rating: "1/4" }),
    entry("srd_bear", "Brown Bear", { challenge_rating: "1" }),
    entry("srd_dragon", "Dragon", { monster_type: "dragon" }),
    entry("srd_crow", "Raven", { speed: "10 ft., fly 50 ft." }),
  ];
  mocks.projection = [
    { id: "u-1", name: "Homebrew Cat", monster_type: "beast", stat_block: { challenge_rating: "0", speed: "40 ft." } },
    { id: "u-2", name: "Hidden Beast", monster_type: "beast", stat_block: null },
  ];
});

describe("useWildShapeCandidates", () => {
  it("a player gets the library half of the index plus the revealed custom beasts, lowest CR first", async () => {
    const { data } = run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return useWildShapeCandidates(() => rules, () => ({ enabled: true }));
    });
    await flushPromises();
    expect(mocks.indexOptions.at(-1)).toEqual({ enabled: true, sides: "library" });
    // Level 4: CR 1/2 cap, no flying. The bear (CR 1), dragon and raven drop out; the unrevealed custom row has no stat block.
    expect(data.value.map((c) => c.name)).toEqual(["Homebrew Cat", "Wolf"]);
    expect(data.value[0]).toEqual({ id: "u-1", name: "Homebrew Cat", challenge_rating: "0", is_shared: false });
  });

  it("a DM reads the whole index and never the player projection", async () => {
    const { data } = run(() => {
      useUiStore().dmPreviewMode = true;
      useCampaignStore().activeCampaignId = "camp-1";
      return useWildShapeCandidates(() => rules, () => ({ enabled: true }));
    });
    await flushPromises();
    expect(mocks.indexOptions.at(-1)).toEqual({ enabled: true, sides: "both" });
    expect(mocks.projectionCalls).toBe(0);
    expect(data.value.map((c) => c.id)).toEqual(["srd_wolf"]);
  });

  it("reads nothing while disabled", async () => {
    run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return useWildShapeCandidates(() => rules, () => ({ enabled: false }));
    });
    await flushPromises();
    expect(mocks.indexOptions.at(-1)?.enabled).toBe(false);
    expect(mocks.projectionCalls).toBe(0);
  });
});
