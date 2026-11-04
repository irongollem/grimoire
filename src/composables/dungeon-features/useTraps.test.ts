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

import { useTrapResolver } from "@/composables/dungeon-features/useTraps";

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

const libraryReads = () => fake.calls.filter((c) => c.target === "library_traps");

beforeEach(() => {
  fake.reset();
  fake.seed("traps", [{ id: OWN_ID, name: "Hidden Pit", user_id: "user-1", campaign_id: null }]);
  fake.seed("library_traps", [
    { id: "grimoire_hidden_pit", name: "Hidden Pit", source: "grimoire" },
    { id: "grimoire_tripwire", name: "Tripwire", source: "grimoire" },
    { id: "grimoire_unrelated", name: "Unrelated", source: "grimoire" },
  ]);
});

describe("useTrapResolver (#1138)", () => {
  // Bug: resolving stored ids by reading the whole library on every page.
  it("reads no library rows when nothing library is cited", async () => {
    const { byId, isLoading } = run(() => useTrapResolver(() => ({ includeAllScopes: true }), () => [OWN_ID, null, undefined]));
    await flushPromises();
    expect(libraryReads()).toHaveLength(0);
    expect(isLoading.value).toBe(false);
    expect([...byId.value.keys()]).toEqual([OWN_ID]);
  });

  // Bug: a cited id pulling in the rest of the library (the 40 kB regression).
  it("returns only the cited library traps, not the rest of the library", async () => {
    const { byId } = run(() => useTrapResolver(() => ({ includeAllScopes: true }), () => ["grimoire_tripwire"]));
    await flushPromises();
    expect([...byId.value.keys()].sort()).toEqual([OWN_ID, "grimoire_tripwire"].sort());
  });

  // Bug: shadowing by name on resolve, so an encounter citing the library pit shows the DM's copy.
  it("resolves a cited library id even when the DM owns a trap of the same name", async () => {
    const { byId } = run(() => useTrapResolver(() => ({ includeAllScopes: true }), () => ["grimoire_hidden_pit"]));
    await flushPromises();
    expect(byId.value.get("grimoire_hidden_pit")?.id).toBe("grimoire_hidden_pit");
    expect(byId.value.get(OWN_ID)?.id).toBe(OWN_ID);
  });

  // Bug: a uuid sent to the text-id library column (a Postgres cast error on a real database).
  it("never asks the library for an own uuid", async () => {
    run(() => useTrapResolver(() => ({ includeAllScopes: true }), () => [OWN_ID, "grimoire_tripwire"]));
    await flushPromises();
    const asked = libraryReads().flatMap((c) => c.filters.flatMap((f) => (Array.isArray(f.value) ? f.value : [])));
    expect(asked).toEqual(["grimoire_tripwire"]);
  });
});
