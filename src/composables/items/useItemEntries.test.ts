import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

/**
 * A library item's id is text (`srd_…`); `item_entries.item_id` is
 * `uuid NOT NULL` with no `library_item_id` companion, so shared content
 * cannot have entries at all. Sending one to the other is not an empty
 * result, it is `22P02 invalid input syntax for type uuid` — an unhandled
 * throw that took the whole player inventory grid down for someone who simply
 * owned a bundled document item. Seen in production as DUNGEON-GRIMOIRE-7 on
 * `/play/inventory`.
 *
 * The old guard was `!!itemId.value` — presence, not shape — which a text id
 * passes happily. This pins the shape check, because the failure is invisible
 * to the compiler: both ids are `string`.
 */
const mocks = vi.hoisted(() => ({ queried: [] as string[] }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, value: string) => {
          mocks.queried.push(value);
          return { eq: () => ({ order: async () => ({ data: [], error: null }) }) };
        },
      }),
    }),
  },
  getCurrentUser: () => ({ id: "u1" }),
}));

import { useItemEntries } from "./useItemEntries";

function open(itemId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(
    defineComponent({
      setup() {
        useItemEntries(ref(itemId), ref("11111111-1111-4111-8111-111111111111"));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
}

beforeEach(() => { mocks.queried = []; });

describe("useItemEntries", () => {
  it("does not query for a library item, whose text id a uuid column cannot hold", async () => {
    open("srd_grimoire_bundled_forged_document");
    await flushPromises();
    expect(mocks.queried).toEqual([]);
  });

  it("still queries for a real vault item", async () => {
    open("22222222-2222-4222-8222-222222222222");
    await flushPromises();
    expect(mocks.queried).toContain("22222222-2222-4222-8222-222222222222");
  });
});
