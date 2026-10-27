import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  slugs: null as string[] | null,
}));

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => mocks.user, supabase: fake.client }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(mocks.slugs), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("pinia", async (orig) => ({ ...(await orig<typeof import("pinia")>()), storeToRefs: (s: unknown) => s }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref("camp-1"), activeCampaign: ref({ id: "camp-1", user_id: "owner-1" }) }) }));

import { useItemIndex } from "@/composables/items/useItemIndex";
import type { ItemIndexEntry } from "@/types/item.types";

function entry(over: Partial<ItemIndexEntry>): Record<string, unknown> {
  return {
    id: "x", name: "X", item_type: "weapon", tags: [], rarity: "common", source: null,
    source_document_key: null, source_record_key: null, image_url: null, ruleset: null, ...over,
  };
}

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

beforeEach(() => {
  fake.reset();
  mocks.user = { id: "user-1" };
  mocks.slugs = ["srd-2024"];
});

async function ids(): Promise<string[] | undefined> {
  const { data } = run(() => useItemIndex());
  await flushPromises();
  return data.value?.map((i) => i.id);
}

describe("useItemIndex (#972)", () => {
  it("reads slim columns, not *", async () => {
    await ids();
    for (const table of ["library_items", "items"]) {
      const cols = fake.calls.find((c) => c.target === table)?.columns;
      expect(cols).not.toBeNull();
      expect(cols).not.toBe("*");
      expect(cols).toContain("item_type");
      expect(cols).toContain("rarity");
    }
  });

  it("library rows: bundled gear and enabled books at this edition come back, a disabled book and the other edition do not", async () => {
    fake.seed("library_items", [
      entry({ id: "bundled", name: "A", source_document_key: "grimoire-bundled", ruleset: null }),
      entry({ id: "enabled", name: "B", source_document_key: "srd-2024", ruleset: "2024" }),
      entry({ id: "edition-neutral", name: "C", source_document_key: "srd-2024", ruleset: null }),
      entry({ id: "disabled-book", name: "D", source_document_key: "tome", ruleset: "2024" }),
      entry({ id: "other-edition", name: "E", source_document_key: "srd-2024", ruleset: "2014" }),
    ]);
    expect(await ids()).toEqual(["bundled", "enabled", "edition-neutral"]);
  });

  it("own rows (#590, co-DM): the campaign's by any author and the caller's and owner's globals, not a stranger's or another campaign's, at this edition", async () => {
    fake.seed("items", [
      entry({ id: "co-dm-campaign", name: "A", campaign_id: "camp-1", user_id: "co-dm" }),
      entry({ id: "mine", name: "B", campaign_id: null, user_id: "user-1" }),
      entry({ id: "owner-library", name: "C", campaign_id: null, user_id: "owner-1" }),
      entry({ id: "stranger", name: "D", campaign_id: null, user_id: "stranger" }),
      entry({ id: "elsewhere", name: "E", campaign_id: "camp-2", user_id: "user-1" }),
      entry({ id: "old-edition", name: "F", campaign_id: "camp-1", user_id: "user-1", ruleset: "2014" }),
      entry({ id: "no-edition", name: "G", campaign_id: "camp-1", user_id: "user-1", ruleset: null }),
    ]);
    expect(await ids()).toEqual(["co-dm-campaign", "mine", "owner-library", "no-edition"]);
  });

  it("merges library and own rows by name; an own copy shadows its library twin, homebrew does not", async () => {
    fake.seed("library_items", [
      entry({ id: "srd_rope", name: "Rope", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "rope" }),
      entry({ id: "srd_sword", name: "Longsword", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "longsword" }),
    ]);
    fake.seed("items", [
      entry({ id: "u-rope", name: "Rope", source: "srd-2024", source_document_key: "srd-2024", source_record_key: "rope", campaign_id: null, user_id: "user-1" }),
      entry({ id: "u-sword", name: "Longsword", campaign_id: "camp-1", user_id: "user-1" }),
    ]);
    const { data } = run(() => useItemIndex());
    await flushPromises();
    expect(data.value?.map((i) => [i.id, i.is_shared])).toEqual([
      ["srd_sword", true],
      ["u-sword", false],
      ["u-rope", false],
    ]);
    expect(data.value?.find((i) => i.id === "srd_sword")?.campaign_id).toBeNull();
  });

  it("sends nothing while disabled", async () => {
    run(() => useItemIndex(() => ({ enabled: false })));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("holds no answer until the caller's own rows have loaded", () => {
    const { data } = run(() => useItemIndex());
    expect(data.value).toBeUndefined();
  });

  it("reads no own rows for a signed-out caller, so there is no index to offer", async () => {
    mocks.user = null;
    const { data } = run(() => useItemIndex());
    await flushPromises();
    expect(fake.calls.some((c) => c.target === "items")).toBe(false);
    expect(data.value).toBeUndefined();
  });

  it("waits for the enabled sources before reading the library, but not before reading own rows", async () => {
    mocks.slugs = null;
    fake.seed("items", [entry({ id: "u-1", name: "Mine", campaign_id: "camp-1", user_id: "user-1" })]);
    expect(await ids()).toEqual(["u-1"]);
    expect(fake.calls.some((c) => c.target === "library_items")).toBe(false);
  });

  it("gives no index when the own-rows read fails, rather than an empty one", async () => {
    fake.failNext("items", { message: "boom" });
    expect(await ids()).toBeUndefined();
  });
});
