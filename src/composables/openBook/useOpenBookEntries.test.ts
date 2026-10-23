import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  upserts: [] as { rows: Record<string, unknown>[]; opts: unknown }[],
  deletes: [] as { eqs: [string, unknown][]; ids: unknown[] }[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      upsert: (rows: Record<string, unknown>[], opts: unknown) => {
        mocks.upserts.push({ rows, opts });
        return Promise.resolve({ error: null });
      },
      delete: () => {
        const call = { eqs: [] as [string, unknown][], ids: [] as unknown[] };
        mocks.deletes.push(call);
        const chain = {
          eq: (c: string, v: unknown) => {
            call.eqs.push([c, v]);
            return chain;
          },
          in: (_c: string, ids: unknown[]) => {
            call.ids = ids;
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  },
}));

const { useSetOpenBookEntries, useClearOpenBookEntries, openBookEntriesKey, ENTRY_UPSERT_CHUNK, ENTRY_DELETE_CHUNK } =
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

describe("open book entries", () => {
  beforeEach(() => {
    mocks.upserts.length = 0;
    mocks.deletes.length = 0;
  });

  it("keys on the doorbell root", () => {
    expect(openBookEntriesKey("c")).toEqual(["open-book-entries", "c"]);
  });

  it("upserts in chunks, de-duplicated, on the composite key", async () => {
    const m = run(() => useSetOpenBookEntries());
    await m.mutateAsync({
      campaignId: "c",
      entityType: "npc",
      ids: [...ids(ENTRY_UPSERT_CHUNK + 1), "id-0"],
      included: false,
    });
    expect(mocks.upserts.map((u) => u.rows.length)).toEqual([ENTRY_UPSERT_CHUNK, 1]);
    expect(mocks.upserts[0]!.opts).toEqual({ onConflict: "campaign_id,entity_type,entity_id" });
    expect(mocks.upserts[0]!.rows[0]).toEqual({
      campaign_id: "c",
      entity_type: "npc",
      entity_id: "id-0",
      included: false,
    });
  });

  it("clears in chunks, always scoped to the campaign and type", async () => {
    const m = run(() => useClearOpenBookEntries());
    await m.mutateAsync({ campaignId: "c", entityType: "location", ids: ids(ENTRY_DELETE_CHUNK + 5) });
    expect(mocks.deletes.map((d) => d.ids.length)).toEqual([ENTRY_DELETE_CHUNK, 5]);
    expect(mocks.deletes[0]!.eqs).toEqual([
      ["campaign_id", "c"],
      ["entity_type", "location"],
    ]);
  });
});
