import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
const campaign = vi.hoisted(() => ({ id: null as string | null }));
// storeToRefs only keeps refs, so the mocked store holds a real one.
vi.mock("@/stores/campaign", async () => {
  const { ref: vueRef } = await import("vue");
  return {
    useCampaignStore: () => {
      return {
        activeCampaignId: vueRef<string | null>(campaign.id),
        activeCampaign: vueRef(campaign.id ? { id: campaign.id, user_id: "owner-1" } : null),
      };
    },
  };
});

import { useMonsterIndex } from "./useMonsterIndex";

function run<T>(setup: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return out;
}

const entry = (id: string, name: string) => ({
  id, name, monster_type: "beast", size: "medium", source: "srd-2024", ruleset: "2024", image_url: null, challenge_rating: "1",
});

beforeEach(() => {
  fake.reset();
  campaign.id = null;
});

describe("useMonsterIndex", () => {
  it("lists only library monsters from an enabled source at the table ruleset", async () => {
    fake.seed("library_monsters", [
      entry("srd_wolf", "Wolf"),
      { ...entry("kp_wolf", "Kobold Wolf"), source: "kobold-press" },
      { ...entry("srd14_wolf", "Old Wolf"), ruleset: "2014" },
    ]);
    const { data } = run(() => useMonsterIndex(() => ({ sides: "library" })));
    await flushPromises();
    expect(data.value?.map((m) => m.id)).toEqual(["srd_wolf"]);
  });

  const mine = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    ...entry(id, name), open5e_import: false, campaign_id: null, user_id: "user-1", ...over,
  });
  const customIds = async () => {
    const { data } = run(() => useMonsterIndex());
    await flushPromises();
    return data.value?.map((m) => m.id);
  };

  it("custom monsters: the campaign's rows (any DM's) and the caller's and owner's globals come back, a stranger's, another campaign's and open5e imports do not", async () => {
    campaign.id = "camp-1";
    // Co-DM (#590): not narrowed to the caller's authorship; the owner's library is readable.
    fake.seed("monsters", [
      mine("own-global", "A"),
      mine("owner-global", "B", { user_id: "owner-1" }),
      mine("co-dm-campaign", "C", { user_id: "co-dm", campaign_id: "camp-1" }),
      mine("stranger-global", "D", { user_id: "stranger" }),
      mine("other-campaign", "E", { campaign_id: "camp-2" }),
      mine("imported", "F", { open5e_import: true }),
      mine("legacy-null-flag", "G", { open5e_import: null }),
    ]);
    expect(await customIds()).toEqual(["own-global", "owner-global", "co-dm-campaign", "legacy-null-flag"]);
  });

  it("custom monsters at another ruleset stay out, and a row with no ruleset fits both", async () => {
    fake.seed("monsters", [
      mine("both", "A", { ruleset: null }),
      mine("current", "B"),
      mine("old-edition", "C", { ruleset: "2014" }),
    ]);
    expect(await customIds()).toEqual(["both", "current"]);
  });

  it("with no active campaign reads only the caller's global custom monsters", async () => {
    fake.seed("monsters", [
      mine("own-global", "A"),
      mine("owner-global", "B", { user_id: "owner-1" }),
      mine("campaign-row", "C", { campaign_id: "camp-1" }),
    ]);
    expect(await customIds()).toEqual(["own-global"]);
  });

  it("merges library then custom, sorted by name, without deduping, marking shared rows", async () => {
    campaign.id = "camp-1";
    fake.seed("library_monsters", [entry("srd_wolf", "Wolf"), entry("srd_ape", "Ape")]);
    fake.seed("monsters", [
      mine("11111111-1111-1111-1111-111111111111", "Wolf", { campaign_id: "camp-1" }),
      mine("22222222-2222-2222-2222-222222222222", "Bat"),
    ]);
    const { data } = run(() => useMonsterIndex());
    await flushPromises();
    expect(data.value?.map((m) => [m.name, m.id, m.is_shared, m.campaign_id])).toEqual([
      ["Ape", "srd_ape", true, null],
      ["Bat", "22222222-2222-2222-2222-222222222222", false, null],
      ["Wolf", "srd_wolf", true, null],
      ["Wolf", "11111111-1111-1111-1111-111111111111", false, "camp-1"],
    ]);
  });

  it('reads only the library half with sides: "library"', async () => {
    fake.seed("library_monsters", [entry("srd_wolf", "Wolf")]);
    const { data } = run(() => useMonsterIndex(() => ({ sides: "library" })));
    await flushPromises();
    expect(fake.calls.map((c) => c.target)).toEqual(["library_monsters"]);
    expect(data.value?.map((m) => m.id)).toEqual(["srd_wolf"]);
  });

  it("sends nothing while disabled", async () => {
    const { data } = run(() => useMonsterIndex(() => ({ enabled: false })));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(data.value).toBeUndefined();
  });

  it("surfaces a failed library read instead of listing an empty bestiary", async () => {
    fake.failNext("library_monsters", { message: "boom" });
    const { data } = run(() => useMonsterIndex(() => ({ sides: "library" })));
    await flushPromises();
    expect(data.value).toBeUndefined();
  });
});
