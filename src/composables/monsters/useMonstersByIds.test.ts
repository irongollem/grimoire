import { defineComponent, h, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { useMonstersByIds } from "./useMonstersByIds";

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  fake.reset();
  fake.seed("library_monsters", [
    { id: "srd_wolf", name: "Wolf", image_url: "lib.webp", portrait_focal_point: null },
    { id: "srd_bear", name: "Bear", image_url: "bear.webp", portrait_focal_point: null },
  ]);
  // A stored reference outlives the DM's source, ruleset and campaign choices (#597, #961).
  fake.seed("monsters", [{ id: UUID_A, name: "Homebrew", image_url: null, campaign_id: "some-other-campaign", user_id: "someone" }]);
  fake.seed("library_monster_art_canonical", [
    { entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null },
    { entry_id: "srd_bear", image_url: "bear-art.webp", cutout_url: null, portrait_focal_point: null },
  ]);
});

/** The by-id fetch waits one macrotask to batch ids, so let that window close before the queries resolve. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

describe("useMonstersByIds", () => {
  it("sends nothing for an empty or all-null list", async () => {
    const { data } = run(() => useMonstersByIds([null, undefined]));
    await settle();
    expect(fake.calls).toEqual([]);
    expect(data.value.size).toBe(0);
  });

  it("resolves library ids and uuids alike, whatever campaign or owner the row has, and leaves unknown ids out", async () => {
    const { data } = run(() => useMonstersByIds(["srd_wolf", UUID_A, "srd_wolf", null, "srd_gone"]));
    await settle();
    expect(data.value.get("srd_wolf")?.is_shared).toBe(true);
    expect(data.value.get(UUID_A)?.name).toBe("Homebrew");
    expect([...data.value.keys()].sort()).toEqual([UUID_A, "srd_wolf"]);
  });

  it("only reads the table a list needs, and no art unless asked", async () => {
    run(() => useMonstersByIds([UUID_A]));
    await settle();
    expect(fake.calls.map((c) => c.target)).toEqual(["monsters"]);

    fake.calls.length = 0;
    run(() => useMonstersByIds(["srd_wolf"]));
    await settle();
    expect(fake.calls.map((c) => c.target)).toEqual(["library_monsters"]);
  });

  it("merges the caller's own art over the canonical picture, never another account's", async () => {
    fake.seed("library_monster_art", [
      { entry_id: "srd_wolf", user_id: "someone-else", image_url: "theirs.webp", cutout_url: null, portrait_focal_point: null },
    ]);
    const stranger = run(() => useMonstersByIds(["srd_wolf"], { withArt: true }));
    await settle();
    expect(stranger.data.value.get("srd_wolf")?.image_url).toBe("art.webp");

    fake.seed("library_monster_art", [
      { entry_id: "srd_bear", user_id: "user-1", image_url: "mine.webp", cutout_url: null, portrait_focal_point: null },
    ]);
    const mine = run(() => useMonstersByIds(["srd_bear"], { withArt: true }));
    await settle();
    expect(mine.data.value.get("srd_bear")?.image_url).toBe("mine.webp");
  });

  it("keeps resolved monsters with their art, and isLoading false, while a grown id set loads", async () => {
    const list = ref(["srd_wolf"]);
    const { data, isLoading } = run(() => useMonstersByIds(list, { withArt: true }));
    await settle();
    list.value = ["srd_wolf", "srd_bear"];
    await nextTick();
    expect(isLoading.value).toBe(false);
    expect([...data.value.keys()]).toEqual(["srd_wolf"]);
    expect(data.value.get("srd_wolf")?.image_url).toBe("art.webp");
    await settle();
    expect([...data.value.keys()].sort()).toEqual(["srd_bear", "srd_wolf"]);
    expect(data.value.get("srd_bear")?.image_url).toBe("bear-art.webp");
  });

  it("coalesces rows asking in the same tick into one request per table, each getting only its own ids", async () => {
    const a = run(() => useMonstersByIds(["srd_wolf", UUID_A]));
    const b = run(() => useMonstersByIds(["srd_bear", UUID_A]));
    await settle();
    expect(fake.calls.filter((c) => c.target === "library_monsters")).toHaveLength(1);
    expect(fake.calls.filter((c) => c.target === "monsters")).toHaveLength(1);
    expect([...a.data.value.keys()].sort()).toEqual([UUID_A, "srd_wolf"].sort());
    expect([...b.data.value.keys()].sort()).toEqual([UUID_A, "srd_bear"].sort());
  });
});
