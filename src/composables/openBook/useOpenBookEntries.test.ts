import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

const { useOpenBookEntries, useSetOpenBookEntries, useClearOpenBookEntries, ENTRY_UPSERT_CHUNK, ENTRY_DELETE_CHUNK } =
  await import("./useOpenBookEntries");

function run<T>(setup: () => T): T {
  let result!: T;
  mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return result;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);
const requests = (op: "upsert" | "delete") => fake.calls.filter((c) => c.target === "open_book_entries" && c.op === op);

describe("open book entries", () => {
  beforeEach(() => fake.reset());

  // A bulk selection can exceed what one request carries; every id must still
  // land, and a repeated id must not become two rows.
  it("writes every selected id once, in chunks", async () => {
    const m = run(() => useSetOpenBookEntries());
    await m.mutateAsync({
      campaignId: "c",
      entityType: "npc",
      ids: [...ids(ENTRY_UPSERT_CHUNK + 1), "id-0"],
      included: false,
    });
    expect(requests("upsert")).toHaveLength(2);
    // One statement may not name the same row twice, so the repeated id is sent once.
    expect(requests("upsert").flatMap((c) => c.payload as unknown[])).toHaveLength(ENTRY_UPSERT_CHUNK + 1);
    // The unique index PostgREST resolves a conflict against.
    expect(requests("upsert")[0]!.options).toEqual({ onConflict: "campaign_id,entity_type,entity_id" });
    const rows = fake.rows("open_book_entries");
    expect(rows).toHaveLength(ENTRY_UPSERT_CHUNK + 1);
    expect(rows[0]).toEqual({ campaign_id: "c", entity_type: "npc", entity_id: "id-0", included: false });
  });

  it("reads only this campaign's choices", async () => {
    fake.seed("open_book_entries", [
      { campaign_id: "c", entity_type: "npc", entity_id: "n1", included: true },
      { campaign_id: "other", entity_type: "npc", entity_id: "n2", included: true },
    ]);
    const q = run(() => useOpenBookEntries("c"));
    await flushPromises();
    expect(q.data.value?.map((r) => r.entity_id)).toEqual(["n1"]);
  });

  it("flips an existing exception instead of adding a second row for the same entry", async () => {
    fake.seed("open_book_entries", [{ campaign_id: "c", entity_type: "npc", entity_id: "id-0", included: false }]);
    const m = run(() => useSetOpenBookEntries());
    await m.mutateAsync({ campaignId: "c", entityType: "npc", ids: ["id-0"], included: true });
    expect(fake.rows("open_book_entries")).toEqual([
      { campaign_id: "c", entity_type: "npc", entity_id: "id-0", included: true },
    ]);
  });

  it("clears every selected id in chunks, and never another campaign's or another kind's choice for the same ids", async () => {
    const mine = ids(ENTRY_DELETE_CHUNK + 5).map((entity_id) => ({ campaign_id: "c", entity_type: "location", entity_id, included: true }));
    fake.seed("open_book_entries", [
      ...mine,
      { campaign_id: "other", entity_type: "location", entity_id: "id-0", included: true },
      { campaign_id: "c", entity_type: "npc", entity_id: "id-0", included: true },
    ]);
    const m = run(() => useClearOpenBookEntries());
    await m.mutateAsync({ campaignId: "c", entityType: "location", ids: ids(ENTRY_DELETE_CHUNK + 5) });
    expect(requests("delete")).toHaveLength(2);
    expect(fake.rows("open_book_entries")).toEqual([
      { campaign_id: "other", entity_type: "location", entity_id: "id-0", included: true },
      { campaign_id: "c", entity_type: "npc", entity_id: "id-0", included: true },
    ]);
  });
});
