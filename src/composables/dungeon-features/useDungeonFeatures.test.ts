import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { useDungeonFeatureResolver } from "@/composables/dungeon-features/useDungeonFeatures";

const OWN_ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => h("div"); } }),
    { global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

const libraryReads = () => fake.calls.filter((c) => c.target === "library_dungeon_features");

beforeEach(() => {
  fake.reset();
  fake.seed("dungeon_features", [{ id: OWN_ID, name: "Trapdoor", user_id: "user-1", campaign_id: null }]);
  fake.seed("library_dungeon_features", [
    { id: "grimoire_trapdoor", name: "Trapdoor", source: "grimoire" },
    { id: "grimoire_secret_door", name: "Secret Door", source: "grimoire" },
    { id: "grimoire_unrelated", name: "Unrelated", source: "grimoire" },
  ]);
});

describe("useDungeonFeatureResolver (#1138)", () => {
  // Bug: resolving stored ids by reading the whole library on every page.
  it("reads no library rows when nothing library is cited", async () => {
    const { byId, isLoading } = run(() => useDungeonFeatureResolver(() => ({ includeAllScopes: true }), () => [OWN_ID, null, undefined]));
    await flushPromises();
    expect(libraryReads()).toHaveLength(0);
    expect(isLoading.value).toBe(false);
    expect([...byId.value.keys()]).toEqual([OWN_ID]);
  });

  // Bug: a cited id pulling in the rest of the library (the 40 kB regression).
  it("returns only the cited library features, not the rest of the library", async () => {
    const { byId } = run(() => useDungeonFeatureResolver(() => ({ includeAllScopes: true }), () => ["grimoire_secret_door"]));
    await flushPromises();
    expect([...byId.value.keys()].sort()).toEqual([OWN_ID, "grimoire_secret_door"].sort());
  });

  // Bug: shadowing by name on resolve, so an encounter citing the library pit shows the DM's copy.
  it("resolves a cited library id even when the DM owns a feature of the same name", async () => {
    const { byId } = run(() => useDungeonFeatureResolver(() => ({ includeAllScopes: true }), () => ["grimoire_trapdoor"]));
    await flushPromises();
    expect(byId.value.get("grimoire_trapdoor")?.id).toBe("grimoire_trapdoor");
    expect(byId.value.get(OWN_ID)?.id).toBe(OWN_ID);
  });

  // Bug: a uuid sent to the text-id library column (a Postgres cast error on a real database).
  it("never asks the library for an own uuid", async () => {
    run(() => useDungeonFeatureResolver(() => ({ includeAllScopes: true }), () => [OWN_ID, "grimoire_secret_door"]));
    await flushPromises();
    const asked = libraryReads().flatMap((c) => c.filters.flatMap((f) => (Array.isArray(f.value) ? f.value : [])));
    expect(asked).toEqual(["grimoire_secret_door"]);
  });

  // Bug: a picker held with `enabled: false` (#972) still fetching the cited library rows.
  it("reads nothing while the caller holds the read with enabled: false", async () => {
    run(() => useDungeonFeatureResolver(() => ({ includeAllScopes: true, enabled: false }), () => ["grimoire_secret_door"]));
    await flushPromises();
    expect(libraryReads()).toHaveLength(0);
  });
});
