import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// #972: the art defaults are a full-table read, so a hook mounted behind a closed
// panel must send nothing. The detail pages' own-row reads are asserted in
// useLibraryMonsterArt.test.ts and useLibrarySpellArt.test.ts.

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "user-1" }), supabase: fake.client }));

import { useLibraryArtDefaults } from "./useLibraryArtDefaults";
import { useLibraryMonsterArtEntry } from "./useLibraryMonsterArt";
import { useLibrarySpellArtEntry } from "./useLibrarySpellArt";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: T;
  mount(
    defineComponent({
      setup() {
        api = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return api;
}

beforeEach(() => fake.reset());

describe("art defaults held back while disabled", () => {
  it("sends no request when enabled is false", async () => {
    run(() => useLibraryArtDefaults(false));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("fetches by default, keyed by content type and name", async () => {
    fake.seed("library_art_defaults", [
      { content_type: "item", content_name: "ring of protection", image_url: "ring.webp", image_focal_point: null },
    ]);
    const defaults = run(() => useLibraryArtDefaults());
    await flushPromises();
    expect(defaults.data.value).toEqual({ "item:ring of protection": { image_url: "ring.webp", image_focal_point: null } });
  });

  it("starts fetching once the gate opens", async () => {
    const open = ref(false);
    run(() => useLibraryArtDefaults(open));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    open.value = true;
    await flushPromises();
    expect(fake.calls.map((c) => c.target)).toEqual(["library_art_defaults"]);
  });
});

describe("single-entry art reads", () => {
  it("resolves null when the monster has no art in either layer", async () => {
    const q = run(() => useLibraryMonsterArtEntry("srd_goblin"));
    await flushPromises();
    expect(q.data.value).toBeNull();
  });

  it("does not read when disabled or when the id is empty", async () => {
    run(() => {
      useLibraryMonsterArtEntry("goblin", () => false);
      useLibraryMonsterArtEntry("");
      useLibrarySpellArtEntry("", true);
    });
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });
});
