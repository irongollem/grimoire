import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { usePlayerMonstersByIds } from "./usePlayerMonstersByIds";
import { useAppUiStore } from "@/stores/ui/app";
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

const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  fake.reset();
  // The projection is what the DM chose to show: the second row is another creature the party has met.
  fake.onRpc("get_player_visible_monsters", () => [
    { id: UUID_A, name: "Homebrew", stat_block: null },
    { id: UUID_B, name: "Not held", stat_block: null },
  ]);
  fake.seed("library_monsters", [{ id: "srd_wolf", name: "Wolf", image_url: "lib.webp", portrait_focal_point: null }]);
  fake.seed("monsters", [{ id: UUID_A, name: "Homebrew Base", image_url: null, stat_block: { hit_points: "secret" } }]);
  fake.seed("library_monster_art_canonical", [
    { entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null },
  ]);
});

const rpcNames = () => fake.calls.filter((c) => c.kind === "rpc").map((c) => c.target);

/** The by-id fetch waits one macrotask to batch ids, so let that window close before the queries resolve. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

describe("usePlayerMonstersByIds", () => {
  it("gives a player library monsters with art, and custom ones only as the DM's projection shows them, never the monsters table", async () => {
    const { data } = run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds(["srd_wolf", UUID_A, null]);
    });
    await settle();
    expect(fake.calls.some((c) => c.target === "monsters")).toBe(false);
    expect(rpcNames()).toEqual(["get_player_visible_monsters"]);
    expect(data.value.get("srd_wolf")?.image_url).toBe("art.webp");
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew");
    expect(data.value.get(UUID_A)?.stat_block).toBeNull();
    // Only the ids asked for come back, not every creature the projection lists.
    expect([...data.value.keys()].sort()).toEqual([UUID_A, "srd_wolf"]);
  });

  it("sends nothing for an empty list", async () => {
    run(() => usePlayerMonstersByIds([]));
    await settle();
    expect(fake.calls).toEqual([]);
  });

  it("does not call the projection when only library ids are held", async () => {
    run(() => {
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds(["srd_wolf"]);
    });
    await settle();
    expect(rpcNames()).toEqual([]);
  });

  it("reads the owner's rows for a DM preview, skipping the projection", async () => {
    const { data } = run(() => {
      useAppUiStore().dmPreviewMode = true;
      useCampaignStore().activeCampaignId = "camp-1";
      return usePlayerMonstersByIds([UUID_A]);
    });
    await settle();
    expect(rpcNames()).toEqual([]);
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew Base");
  });
});
