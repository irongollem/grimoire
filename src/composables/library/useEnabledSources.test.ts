import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => null }));
vi.mock("@/composables/rules/useRuleset", () => ({
  useRuleset: () => ({ ruleset: ref("2014") }),
  useTableRuleset: () => ({ ruleset: ref("2014") }),
  useContentScope: () => ({ standalone: ref(false) }),
}));

import {
  mergeAvailableSources,
  resolveLibrarySlugs,
  useAvailablePlayerBooks,
  useDisableSource,
  useDisableUserSource,
  useEnableUserSource,
  useEnabledSources,
  useUserEnabledSources,
} from "./useEnabledSources";

const CAMPAIGN_ENABLED = [{ source_slug: "srd-2014" }, { source_slug: "tob" }];
const USER_ENABLED = [{ source_slug: "toh" }, { source_slug: "srd-2014" }];

describe("resolveLibrarySlugs", () => {
  it("returns the campaign's enabled sources when not standalone", () => {
    expect(
      resolveLibrarySlugs({ standalone: false, campaignEnabled: CAMPAIGN_ENABLED, userEnabled: USER_ENABLED }),
    ).toEqual(["srd-2014", "tob"]);
  });

  it("returns null while a table's enabled sources are still loading", () => {
    // Load-bearing: callers gate their library query on `!== null`. Returning
    // [] here would fire a query matching nothing and cache the empty result.
    expect(resolveLibrarySlugs({ standalone: false, campaignEnabled: undefined, userEnabled: [] })).toBeNull();
  });

  it("returns an empty list when a table has genuinely disabled everything", () => {
    expect(resolveLibrarySlugs({ standalone: false, campaignEnabled: [], userEnabled: [] })).toEqual([]);
  });

  it("returns both SRDs plus the player's books when standalone, without duplicates", () => {
    expect(
      resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: USER_ENABLED }),
    ).toEqual(["srd-2014", "srd-2024", "toh"]);
  });

  it("returns just the SRDs when the player enabled nothing, and never null", () => {
    // #736/#737: the campaign query is disabled without a campaign, so its data
    // never arrives. A standalone read must not wait on it.
    const slugs = resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: [] });
    expect(slugs).toEqual(["srd-2014", "srd-2024"]);
  });

  it("returns null while the player's own rows are still loading", () => {
    expect(resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: undefined })).toBeNull();
  });

  it("ignores the campaign's sources when standalone", () => {
    // A table-less character viewed from inside a campaign reads the player's books.
    expect(
      resolveLibrarySlugs({ standalone: true, campaignEnabled: CAMPAIGN_ENABLED, userEnabled: [] }),
    ).toEqual(["srd-2014", "srd-2024"]);
  });
});

describe("mergeAvailableSources", () => {
  it("sums counts per source and sorts by title", () => {
    const merged = mergeAvailableSources([
      { source: "toh", source_title: "Tome of Heroes", count: 5 },
      { source: "kp", source_title: "Kobold Press", count: 2 },
      { source: "toh", source_title: "Tome of Heroes", count: 7 },
    ]);
    expect(merged).toEqual([
      { source: "kp", source_title: "Kobold Press", count: 2 },
      { source: "toh", source_title: "Tome of Heroes", count: 12 },
    ]);
  });

  it("sorts by title rather than slug, and takes a title from any copy of the book that has one", () => {
    const merged = mergeAvailableSources([
      { source: "a-book", source_title: null, count: 1 },
      { source: "z-book", source_title: "Apple Press", count: 1 },
      { source: "a-book", source_title: "Zebra Press", count: 1 },
    ]);
    expect(merged).toEqual([
      { source: "z-book", source_title: "Apple Press", count: 1 },
      { source: "a-book", source_title: "Zebra Press", count: 2 },
    ]);
  });

  it("sorts an untitled source by its slug", () => {
    const merged = mergeAvailableSources([
      { source: "zzz", source_title: null, count: 1 },
      { source: "aaa", source_title: null, count: 1 },
    ]);
    expect(merged.map((m) => m.source)).toEqual(["aaa", "zzz"]);
  });
});

describe("the enabled books over the database", () => {
  function run<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({ setup() { out = setup(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }
  const userSource = (source_slug: string, user_id = "me") => ({ id: `${user_id}-${source_slug}`, user_id, source_slug, source_title: source_slug });
  const campaignSource = (source_slug: string, campaign_id = "c1") => ({ id: `${campaign_id}-${source_slug}`, campaign_id, source_slug, source_title: source_slug });

  beforeEach(() => {
    fake.reset();
    setActivePinia(createPinia());
    useAuthStore().user = { id: "me" } as never;
    useCampaignStore().activeCampaignId = "c1";
  });

  it("lists only my own enabled books, never another player's", async () => {
    fake.seed("user_enabled_sources", [userSource("toh"), userSource("kp", "someone-else")]);
    const books = run(() => useUserEnabledSources());
    await flushPromises();
    expect(books.data.value?.map((b) => b.source_slug)).toEqual(["toh"]);
  });

  it("lists only the active campaign's enabled books", async () => {
    fake.seed("campaign_enabled_sources", [campaignSource("tob"), campaignSource("kp", "c2")]);
    const books = run(() => useEnabledSources());
    await flushPromises();
    expect(books.data.value?.map((b) => b.source_slug)).toEqual(["tob"]);
  });

  it("reads nothing while the panel is inactive", async () => {
    run(() => useEnabledSources(false));
    run(() => useUserEnabledSources(false));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("switching a book off removes my row for it, and not another player's row for the same book", async () => {
    fake.seed("user_enabled_sources", [userSource("toh", "someone-else"), userSource("toh"), userSource("kp")]);
    await run(() => useDisableUserSource()).mutateAsync("toh");
    expect(fake.rows("user_enabled_sources").map((r) => r.id).sort()).toEqual(["me-kp", "someone-else-toh"]);
  });

  it("switching a book off for the table removes it from this campaign only", async () => {
    fake.seed("campaign_enabled_sources", [campaignSource("tob", "c2"), campaignSource("tob"), campaignSource("kp")]);
    await run(() => useDisableSource()).mutateAsync("tob");
    expect(fake.rows("campaign_enabled_sources").map((r) => r.id).sort()).toEqual(["c1-kp", "c2-tob"]);
  });

  it("enabling or disabling a personal book while signed out is refused and writes nothing", async () => {
    useAuthStore().user = null;
    fake.seed("user_enabled_sources", [userSource("toh")]);
    await expect(run(() => useEnableUserSource()).mutateAsync({ source_slug: "kp", source_title: null })).rejects.toThrow("Not authenticated");
    await expect(run(() => useDisableUserSource()).mutateAsync("toh")).rejects.toThrow("Not authenticated");
    expect(fake.rows("user_enabled_sources")).toHaveLength(1);
  });

  it("offers the books the library holds for species, spells and backgrounds, summed per book, and fails whole if one read fails", async () => {
    fake.onRpc("get_library_species_sources", () => [{ source: "toh", source_title: "Tome of Heroes", count: 3 }]);
    fake.onRpc("get_library_spell_sources", () => [{ source: "toh", source_title: "Tome of Heroes", count: 4 }, { source: "kp", source_title: "Kobold Press", count: 1 }]);
    fake.onRpc("get_library_background_sources", () => []);
    const books = run(() => useAvailablePlayerBooks());
    await flushPromises();
    expect(books.data.value).toEqual([
      { source: "kp", source_title: "Kobold Press", count: 1 },
      { source: "toh", source_title: "Tome of Heroes", count: 7 },
    ]);

    fake.failNext("get_library_background_sources", { message: "down" });
    const failing = run(() => useAvailablePlayerBooks());
    await flushPromises();
    expect(failing.data.value ?? null).toBeNull();
    expect(failing.error.value?.message).toBe("down");
  });
});
