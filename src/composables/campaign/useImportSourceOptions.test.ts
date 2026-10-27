import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const activeCampaignId = ref<string | null>("campaign-1");
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() { return activeCampaignId.value; },
  }),
}));

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ currentUser: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => mocks.currentUser }));

import { useImportSourceOptions } from "./useImportSourceOptions";

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useImportSourceOptions>;
  mount(
    defineComponent({
      setup() {
        api = useImportSourceOptions();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api, queryClient };
}

/** A row of the DM's own naming; the other columns are what marks a book as library-sourced. */
const own = (source: string, campaign_id: string, over: Record<string, unknown> = {}) => ({
  user_id: "user-1", source, campaign_id, source_document_key: null, ...over,
});

beforeEach(() => {
  fake.reset();
  activeCampaignId.value = "campaign-1";
  mocks.currentUser = { id: "user-1" };
});

describe("useImportSourceOptions", () => {
  it("merges the DM's own source titles across monsters/items/spells, ranked by use", async () => {
    fake.seed("monsters", [
      own("Icewind Dale: Rime of the Frostmaiden", "campaign-1", { open5e_import: false }),
      own("Icewind Dale: Rime of the Frostmaiden", "campaign-1", { open5e_import: false }),
    ]);
    fake.seed("items", [own("Curse of Strahd", "campaign-1")]);

    const { api } = open();
    await flushPromises();

    expect(api().options.value).toEqual([
      { value: "Icewind Dale: Rime of the Frostmaiden", count: 2 },
      { value: "Curse of Strahd", count: 1 },
    ]);
  });

  it("offers only the DM's own naming: never another account's rows, rows with no source, or books that came from the library or Open5e", async () => {
    fake.seed("monsters", [
      own("Mine", "campaign-1", { open5e_import: false }),
      own("Someone Else's", "campaign-1", { user_id: "user-2", open5e_import: false }),
      own("Open5e Import", "campaign-1", { open5e_import: true }),
      own("Library Book", "campaign-1", { source_document_key: "srd-2014", open5e_import: false }),
      { user_id: "user-1", source: null, campaign_id: "campaign-1", source_document_key: null, open5e_import: false },
    ]);
    // Items have no open5e_import column at all.
    fake.seed("items", [own("Item Book", "campaign-1"), own("Library Item", "campaign-1", { source_document_key: "srd-2014" })]);
    fake.seed("spells", [own("Spell Book", "campaign-1", { open5e_import: false }), own("Open5e Spell", "campaign-1", { open5e_import: true })]);

    const { api } = open();
    await flushPromises();

    expect(api().options.value.map((o) => o.value).sort()).toEqual(["Item Book", "Mine", "Spell Book"]);
  });

  it("returns nothing when signed out, rather than querying with no user", async () => {
    mocks.currentUser = null;
    fake.seed("monsters", [own("Should Not Appear", "campaign-1", { open5e_import: false })]);

    const { api } = open();
    await flushPromises();

    expect(api().options.value).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("reports a failed read as an error, never as a DM with no source history", async () => {
    fake.seed("items", [own("Item Book", "campaign-1")]);
    fake.failNext("monsters", { message: "connection reset", code: "08006" });

    const { api, queryClient } = open();
    await flushPromises();

    expect(queryClient.getQueryState(["import-source-options"])?.status).toBe("error");
    expect(api().options.value).toEqual([]);
  });

  it("prefills the most-used title in the active campaign", async () => {
    fake.seed("monsters", [
      own("Icewind Dale: Rime of the Frostmaiden", "other-campaign", { open5e_import: false }),
      own("Icewind Dale: Rime of the Frostmaiden", "other-campaign", { open5e_import: false }),
      own("Curse of Strahd", "campaign-1", { open5e_import: false }),
    ]);

    const { api } = open();
    await flushPromises();

    expect(api().defaultSourceTitle.value).toBe("Curse of Strahd");
  });

  it("falls back to null when there is no active campaign to prefill against", async () => {
    activeCampaignId.value = null;
    fake.seed("monsters", [own("Curse of Strahd", "campaign-1", { open5e_import: false })]);

    const { api } = open();
    await flushPromises();

    expect(api().defaultSourceTitle.value).toBeNull();
  });
});
