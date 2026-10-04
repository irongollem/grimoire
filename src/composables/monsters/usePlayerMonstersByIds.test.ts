import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

type Call = { table: string; in: [string, unknown[]][] };
const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  rpcCalls: [] as string[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  projection: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const call: Call = { table, in: [] };
    mocks.calls.push(call);
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
      new Promise<{ data: unknown[]; error: null }>((resolve) => {
        queueMicrotask(() => {
          const ids = new Set(call.in.flatMap(([, v]) => v));
          const rows = (mocks.rows[table] ?? []).filter((r) => ids.size === 0 || ids.has(String(r.id ?? r.entry_id)));
          resolve({ data: rows, error: null });
        });
      }),
      {} as Record<string, unknown>,
    );
    b.select = () => b;
    b.eq = () => b;
    b.in = (c: string, v: unknown[]) => (call.in.push([c, v]), b);
    return b;
  };
  return {
    getCurrentUser: () => ({ id: "user-1" }),
    supabase: {
      from: builder,
      rpc: (name: string) => {
        mocks.rpcCalls.push(name);
        return Promise.resolve({ data: mocks.projection, error: null });
      },
    },
  };
});

import { usePlayerMonstersByIds } from "./usePlayerMonstersByIds";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  mocks.calls.length = 0;
  mocks.rpcCalls.length = 0;
  mocks.projection = [{ id: UUID_A, name: "Homebrew", stat_block: null }];
  mocks.rows = {
    library_monsters: [{ id: "srd_wolf", name: "Wolf", image_url: "lib.webp", portrait_focal_point: null }],
    monsters: [{ id: UUID_A, name: "Homebrew Base", image_url: null }],
    library_monster_art_canonical: [{ entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null }],
    library_monster_art: [],
  };
});

describe("usePlayerMonstersByIds", () => {
  it("reads a player's library ids by id with art, and custom ids from the projection, never the monsters table", async () => {
    const { data } = run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds(["srd_wolf", UUID_A, null]);
    });
    await flushPromises();
    expect(mocks.calls.some((c) => c.table === "monsters")).toBe(false);
    const lib = mocks.calls.find((c) => c.table === "library_monsters");
    expect(lib?.in).toEqual([["id", ["srd_wolf"]]]);
    expect(mocks.rpcCalls).toEqual(["get_player_visible_monsters"]);
    expect(data.value.get("srd_wolf")?.image_url).toBe("art.webp");
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew");
    expect(data.value.get(UUID_A)?.stat_block).toBeNull();
  });

  it("sends nothing for an empty list", async () => {
    run(() => usePlayerMonstersByIds([]));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(mocks.rpcCalls).toEqual([]);
  });

  it("does not call the projection when only library ids are held", async () => {
    run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds(["srd_wolf"]);
    });
    await flushPromises();
    expect(mocks.rpcCalls).toEqual([]);
  });

  it("delegates to the by-id owner read for a DM preview, skipping the projection", async () => {
    const { data } = run(() => {
      useUiStore().dmPreviewMode = true;
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds([UUID_A]);
    });
    await flushPromises();
    expect(mocks.rpcCalls).toEqual([]);
    expect(mocks.calls.find((c) => c.table === "monsters")?.in).toEqual([["id", [UUID_A]]]);
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew Base");
  });
});
