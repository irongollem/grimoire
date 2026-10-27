import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import { useAddItemEntry, useDeleteItemEntry, useItemEntries, useUpdateItemEntry } from "./useItemEntries";

const ITEM = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

function inQueryClient<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

const entry = (over: Record<string, unknown>) => ({
  id: "e1",
  item_id: ITEM,
  campaign_id: CAMPAIGN,
  user_id: "u1",
  party_member_id: null,
  content: "{}",
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

beforeEach(() => fake.reset());

/**
 * A library item's id is text (`srd_…`); `item_entries.item_id` is
 * `uuid NOT NULL` with no `library_item_id` companion, so shared content
 * cannot have entries at all. Sending one to the other is `22P02 invalid
 * input syntax for type uuid`, an unhandled throw that took the whole player
 * inventory grid down (DUNGEON-GRIMOIRE-7 on `/play/inventory`).
 */
describe("useItemEntries", () => {
  it("does not query for a library item, whose text id a uuid column cannot hold", async () => {
    inQueryClient(() => useItemEntries(ref("srd_grimoire_bundled_forged_document"), ref(CAMPAIGN)));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("reads this item's entries at this campaign, oldest first, and not another table's", async () => {
    fake.seed("item_entries", [
      entry({ id: "late", created_at: "2026-10-03T00:00:00Z" }),
      entry({ id: "early", created_at: "2026-10-01T00:00:00Z" }),
      entry({ id: "other-campaign", campaign_id: "99999999-9999-4999-8999-999999999999" }),
      entry({ id: "other-item", item_id: "33333333-3333-4333-8333-333333333333" }),
    ]);
    const q = inQueryClient(() => useItemEntries(ref(ITEM), ref(CAMPAIGN)));
    await vi.waitFor(() => expect(q.data.value?.map((e) => e.id)).toEqual(["early", "late"]));
  });

  it("reports a failed read instead of an empty ledger", async () => {
    fake.failNext("item_entries", { message: "boom" });
    const q = inQueryClient(() => useItemEntries(ref(ITEM), ref(CAMPAIGN)));
    await vi.waitFor(() => expect(q.isError.value).toBe(true));
  });
});

describe("item entry writes", () => {
  it("adds an entry as the signed-in user", async () => {
    const add = inQueryClient(() => useAddItemEntry());
    await add.mutateAsync({ item_id: ITEM, campaign_id: CAMPAIGN, party_member_id: "pm1", content: "{}" });
    expect(fake.rows("item_entries")).toMatchObject([{ item_id: ITEM, user_id: "u1", party_member_id: "pm1" }]);
  });

  it("edits one entry's content and no other", async () => {
    fake.seed("item_entries", [entry({ id: "e1", content: "old" }), entry({ id: "e2", content: "old" })]);
    const edit = inQueryClient(() => useUpdateItemEntry(ref(ITEM), ref(CAMPAIGN)));
    await edit.mutateAsync({ id: "e1", update: { content: "new" } });
    expect(fake.rows("item_entries").map((e) => e.content)).toEqual(["new", "old"]);
  });

  it("deletes one entry and no other", async () => {
    fake.seed("item_entries", [entry({ id: "e1" }), entry({ id: "e2" })]);
    const del = inQueryClient(() => useDeleteItemEntry(ref(ITEM), ref(CAMPAIGN)));
    await del.mutateAsync("e1");
    expect(fake.rows("item_entries").map((e) => e.id)).toEqual(["e2"]);
  });
});
