import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// #972: the art defaults are a full-table read, so a hook mounted behind a closed
// panel must send nothing, and a detail page must read its own row only.

interface Read {
  table: string;
  filters: [string, unknown][];
}

const mocks = vi.hoisted(() => ({
  reads: [] as { table: string; filters: [string, unknown][] }[],
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: (table: string) => {
      const read: Read = { table, filters: [] };
      mocks.reads.push(read);
      // A real promise carrying the chain methods, so it is awaitable without a hand-made thenable.
      const builder: Promise<{ data: unknown[]; error: null }> & {
        select: () => unknown;
        eq: (column: string, value: unknown) => unknown;
      } = Object.assign(Promise.resolve({ data: mocks.rows[table] ?? [], error: null }), {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return builder;
        },
      });
      return builder;
    },
  },
}));

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

beforeEach(() => {
  mocks.reads.length = 0;
  mocks.rows = {};
});

describe("art defaults held back while disabled", () => {
  it("sends no request when enabled is false", async () => {
    run(() => useLibraryArtDefaults(false));
    await flushPromises();
    expect(mocks.reads).toEqual([]);
  });

  it("fetches when enabled (the default)", async () => {
    run(() => useLibraryArtDefaults());
    await flushPromises();
    expect(mocks.reads.map((r) => r.table)).toEqual(["library_art_defaults"]);
  });

  it("starts fetching once the gate opens", async () => {
    const open = ref(false);
    run(() => useLibraryArtDefaults(open));
    await flushPromises();
    expect(mocks.reads).toEqual([]);
    open.value = true;
    await flushPromises();
    expect(mocks.reads.map((r) => r.table)).toEqual(["library_art_defaults"]);
  });
});

describe("single-entry art reads", () => {
  it("reads one monster's canonical row and the caller's own row, merged per field", async () => {
    mocks.rows.library_monster_art_canonical = [
      { entry_id: "srd_goblin", image_url: "canon.webp", cutout_url: "cut.webp", portrait_focal_point: null },
    ];
    mocks.rows.library_monster_art = [
      { entry_id: "srd_goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.1, y: 0.2 } },
    ];
    const q = run(() => useLibraryMonsterArtEntry("srd_goblin"));
    await flushPromises();

    expect(mocks.reads).toEqual([
      { table: "library_monster_art_canonical", filters: [["entry_id", "srd_goblin"]] },
      {
        table: "library_monster_art",
        filters: [
          ["entry_id", "srd_goblin"],
          ["user_id", "user-1"],
        ],
      },
    ]);
    expect(q.data.value).toEqual({
      image_url: "mine.webp",
      cutout_url: "cut.webp",
      portrait_focal_point: { x: 0.1, y: 0.2 },
    });
  });

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
    expect(mocks.reads).toEqual([]);
  });

  it("reads one spell, the caller's own row winning over canonical", async () => {
    mocks.rows.library_spell_art_canonical = [{ entry_id: "srd_fireball", image_url: "canon.webp", portrait_focal_point: null }];
    mocks.rows.library_spell_art = [{ entry_id: "srd_fireball", image_url: "mine.webp", portrait_focal_point: null }];
    const q = run(() => useLibrarySpellArtEntry("srd_fireball"));
    await flushPromises();

    expect(mocks.reads.map((r) => [r.table, r.filters])).toEqual([
      ["library_spell_art_canonical", [["entry_id", "srd_fireball"]]],
      [
        "library_spell_art",
        [
          ["entry_id", "srd_fireball"],
          ["user_id", "user-1"],
        ],
      ],
    ]);
    expect(q.data.value).toEqual({ image_url: "mine.webp", portrait_focal_point: null });
  });
});
