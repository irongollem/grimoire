import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { useLinkInventoryCatalogueItem } from "./usePartyInventory";

const CUSTOM_ID = "11111111-1111-4111-8111-111111111111";
const LIBRARY_ID = "srd_light-crossbow";
const row = {
  id: "gear", campaign_id: "camp", name: "Light Crossbow", item_id: null, library_item_id: null,
  quantity: 2, notes: "From the innkeeper", carried_by: "pc", location: "container", container_id: "pack",
};

function mountLink() {
  let link!: ReturnType<typeof useLinkInventoryCatalogueItem>;
  const wrapper = mount(defineComponent({
    setup() {
      link = useLinkInventoryCatalogueItem();
      return () => h("div");
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return { link: link.mutateAsync, unmount: () => wrapper.unmount() };
}

beforeEach(() => fake.reset());

describe("linking name-only inventory", () => {
  it("links the original stack and keeps its notes, owner, and container", async () => {
    fake.seed("party_inventory", [row]);
    const { link, unmount } = mountLink();
    try {
      await expect(link({ inventoryId: row.id, campaignId: row.campaign_id, catalogueId: LIBRARY_ID }))
        .resolves.toMatchObject({ ...row, library_item_id: LIBRARY_ID });
      expect(fake.rows("party_inventory")).toMatchObject([{ ...row, library_item_id: LIBRARY_ID }]);
    } finally { unmount(); }
  });

  it.each([
    { campaign_id: "other-campaign" },
    { item_id: CUSTOM_ID },
    { library_item_id: "srd_other-crossbow" },
  ])("refuses a stale or mismatched target with %o", async (overrides) => {
    const existing = { ...row, ...overrides };
    fake.seed("party_inventory", [existing]);
    const { link, unmount } = mountLink();
    try {
      await expect(link({ inventoryId: row.id, campaignId: row.campaign_id, catalogueId: LIBRARY_ID }))
        .rejects.toThrow("already linked or is no longer available");
      expect(fake.rows("party_inventory")).toMatchObject([existing]);
    } finally { unmount(); }
  });
});
