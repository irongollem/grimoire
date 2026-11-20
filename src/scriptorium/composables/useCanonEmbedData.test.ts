import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { EntityRef } from "@/scriptorium/lib/entityEmbeds";

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, error: null as Error | null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (column: string, ids: string[]) =>
          Promise.resolve(
            mocks.error
              ? { data: null, error: mocks.error }
              : { data: (mocks.tables[table] ?? []).filter((r) => ids.includes(r[column] as string)), error: null },
          ),
      }),
    }),
  },
}));

import { useCanonEmbedData } from "./useCanonEmbedData";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

function open(refs: EntityRef[]) {
  let api!: ReturnType<typeof useCanonEmbedData>;
  mount(
    defineComponent({
      setup() {
        api = useCanonEmbedData(ref(refs));
        return () => h("div");
      },
    }),
    { global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return () => api;
}

describe("useCanonEmbedData", () => {
  beforeEach(() => {
    mocks.error = null;
    mocks.tables = {
      canon_entries: [
        { id: "truth", part: "truth", title: "The sea is dying", premise_kind: null },
        { id: "lore", part: "lore", title: "The Fall", lore_kind: "history", world_year: null, body: doc("It fell.") },
        { id: "secret", part: "secret", title: "The king is drowned" },
        { id: "force", part: "force", title: "Tide Cult", wants: "The tide" },
      ],
      canon_lore_passages: [
        { id: "p2", entry_id: "lore", sort_order: 2, title: "Second", body: doc("two") },
        { id: "p1", entry_id: "lore", sort_order: 1, title: "First", body: doc("one") },
      ],
      canon_clues: [{ id: "c1", secret_id: "secret", sort_order: 1, title: "A ring", location_id: "vault", npc_id: null, quest_beat_id: null }],
      canon_force_steps: [
        { id: "s2", force_id: "force", sort_order: 2, title: "Drown" },
        { id: "s1", force_id: "force", sort_order: 1, title: "Gather" },
      ],
      locations: [{ id: "vault", name: "The Vault" }],
    };
  });

  it("formats each kind from the rows by id: lore with its passages in order, a secret with where its clues lie, a force with its steps", async () => {
    const api = open(["truth", "lore", "secret", "force"].map((id) => ({ type: "canon", id })));
    await flushPromises();
    await flushPromises();
    const { lookup } = api();
    expect(lookup.value.get("truth")).toContain("The sea is dying");
    const lore = lookup.value.get("lore")!;
    expect(lore.indexOf("First")).toBeLessThan(lore.indexOf("Second"));
    expect(lookup.value.get("secret")).toContain("A ring <em>(The Vault)</em>");
    const force = lookup.value.get("force")!;
    expect(force.indexOf("Gather")).toBeLessThan(force.indexOf("Drown"));
  });

  it("has nothing for an entry that is gone, so the book shows its missing marker", async () => {
    const api = open([{ type: "canon", id: "gone" }]);
    await flushPromises();
    expect(api().lookup.value.has("gone")).toBe(false);
  });

  it("asks for nothing when the book holds no canon link", async () => {
    mocks.error = new Error("must not be read");
    const api = open([{ type: "npc", id: "n1" }]);
    await flushPromises();
    expect(api().isLoading.value).toBe(false);
    expect(api().lookup.value.size).toBe(0);
  });
});
