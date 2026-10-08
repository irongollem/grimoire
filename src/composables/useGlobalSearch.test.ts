import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  result: { data: [] as unknown[], error: null as unknown },
  /** Per-table override; falls back to `result`. */
  byTable: {} as Record<string, { data: unknown[] | null; error: unknown }>,
  report: vi.fn(),
  invoke: vi.fn(),
  fetchArt: vi.fn(),
  isDM: true,
  isPro: true,
  subscriptionLoading: false,
  isChild: false,
  slugs: ["srd-2024"] as string[] | null,
  ruleset: "2024",
  calls: [] as { table: string; method: string; args: unknown[] }[],
  campaignId: "campaign-1" as string | null,
  /** The gate the search hands `useLibrarySourceSlugs`: whether it may read the books yet. */
  sourcesActive: null as (() => boolean) | null,
}));

vi.mock("@/composables/library/useLibraryMonsterArt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/library/useLibraryMonsterArt")>()),
  fetchLibraryMonsterArtEntries: mocks.fetchArt,
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));

/** Any PostgREST chain (`.select().eq().ilike().limit()`...) resolving to `mocks.result`. */
function chain(table: string): unknown {
  const builder: Record<string, unknown> = {};
  return new Proxy(builder, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(mocks.byTable[table] ?? mocks.result);
      return (...args: unknown[]) => { mocks.calls.push({ table, method: String(prop), args }); return chain(table); };
    },
  });
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => { mocks.from(table); return chain(table); },
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaignId() { return mocks.campaignId; } }) }));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: (active: () => boolean) => {
    mocks.sourcesActive = active;
    return { slugs: { get value() { return mocks.slugs; } }, isLoading: { value: false } };
  },
}));
vi.mock("@/composables/rules/useRuleset", () => ({
  useRuleset: () => ({ ruleset: { get value() { return mocks.ruleset; } } }),
  useTableRuleset: () => ({ ruleset: { get value() { return mocks.ruleset; } } }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return mocks.isDM; } }) }));
vi.mock("@/composables/billing/useSubscription", async () => {
  const { computed } = await import("vue");
  return {
    useSubscription: () => ({
      isPro: computed(() => mocks.isPro),
      isLoading: computed(() => mocks.subscriptionLoading),
    }),
  };
});
vi.mock("@/composables/account/useChildAccount", async () => {
  const { computed } = await import("vue");
  return { useChildAccount: () => ({ isChild: computed(() => mocks.isChild), isLoading: computed(() => false) }) };
});

import { PRO_UPSELL_DISMISSED_KEY, SEARCH_DEBOUNCE_MS, SEMANTIC_DEBOUNCE_MS, useGlobalSearch } from "./useGlobalSearch";

let client: QueryClient;
let apps: App[] = [];

function mount<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: client });
  app.mount(document.createElement("div"));
  apps.push(app);
  return out;
}

/** Ten tables per search: notes, npcs, monsters, library_monsters, spells,
 *  library_spells, items, locations, quests, factions. */
const TABLES_PER_SEARCH = 10;

describe("useGlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.from.mockReset();
    mocks.result = { data: [], error: null };
    mocks.byTable = {};
    mocks.report.mockReset();
    mocks.invoke.mockReset();
    mocks.fetchArt.mockReset();
    mocks.fetchArt.mockResolvedValue({});
    mocks.invoke.mockResolvedValue({ data: { hits: [] }, error: null });
    mocks.isDM = true;
    mocks.isPro = true;
    mocks.subscriptionLoading = false;
    mocks.isChild = false;
    localStorage.clear();
    mocks.campaignId = "campaign-1";
    mocks.slugs = ["srd-2024"];
    mocks.ruleset = "2024";
    mocks.calls = [];
  });
  afterEach(() => {
    apps.forEach((a) => a.unmount());
    apps = [];
    vi.useRealTimers();
  });

  it("searches once when typing pauses, not once per keystroke", async () => {
    const query = ref("");
    const search = mount(() => useGlobalSearch(query));

    for (const typed of ["go", "gob", "gobl", "gobli", "goblin"]) {
      query.value = typed;
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS / 2);
    }
    expect(mocks.from).not.toHaveBeenCalled();
    expect(search.isFetching.value).toBe(true); // still typing reads as searching

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(mocks.from).toHaveBeenCalledTimes(TABLES_PER_SEARCH);
  });

  it("does not ask for the enabled books until there is something to search (#999 2.15)", async () => {
    // The box is mounted on every page; reading the books at mount cost two
    // requests on every page load before anyone searched.
    const query = ref("");
    mount(() => useGlobalSearch(query));
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    expect(mocks.sourcesActive?.()).toBe(false);

    query.value = "goblin";
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(mocks.sourcesActive?.()).toBe(true);
  });

  it("sends nothing below two letters", async () => {
    const query = ref("g");
    mount(() => useGlobalSearch(query));
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  async function run() {
    const query = ref("goblin");
    const search = mount(() => useGlobalSearch(query));
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    return search;
  }

  const err = { message: "permission denied" };

  it("keeps the groups that succeeded and names the one that failed", async () => {
    mocks.byTable = {
      notes: { data: [{ id: "n1", title: "Goblin lore" }], error: null },
      quests: { data: null, error: err },
    };
    const search = await run();
    expect(search.isError.value).toBe(false);
    expect(search.data.value?.groups.map((g) => g.label)).toEqual(["Notes"]);
    expect(search.data.value?.failedGroups).toEqual(["Quests"]);
    expect(mocks.report).toHaveBeenCalledWith(err, "global-search", { group: "Quests" });
  });

  it("still shows the other monster read when one fails, listing Bestiary once", async () => {
    mocks.byTable = {
      monsters: { data: null, error: err },
      library_monsters: { data: [{ id: "m1", name: "Goblin" }], error: null },
    };
    const search = await run();
    const bestiary = search.data.value?.groups.find((g) => g.label === "Bestiary");
    expect(bestiary?.items.map((i) => i.name)).toEqual(["Goblin"]);
    expect(search.data.value?.failedGroups).toEqual(["Bestiary"]);

    mocks.byTable = {
      monsters: { data: null, error: err },
      library_monsters: { data: null, error: err },
    };
    client.clear();
    const both = await run();
    expect(both.data.value?.failedGroups).toEqual(["Bestiary"]);
  });

  it("reports an error only when every read failed", async () => {
    mocks.result = { data: null as unknown as unknown[], error: err };
    const search = await run();
    expect(search.isError.value).toBe(true);
  });
  it("finds factions and names them as their own group", async () => {
    mocks.byTable = { factions: { data: [{ id: "f1", name: "Goblin Court" }], error: null } };
    const search = await run();
    const group = search.data.value?.groups.find((g) => g.type === "faction");
    expect(group?.label).toBe("Factions");
    expect(group?.items[0]).toMatchObject({ route: "/factions/f1", matchedBy: "name" });
  });

  describe("library gating", () => {
    const callsOn = (table: string) => mocks.calls.filter((c) => c.table === table);

    it("reads library monsters and spells only from enabled books at the table edition", async () => {
      mocks.slugs = ["srd-2024", "kp-bestiary"];
      await run();
      for (const table of ["library_monsters", "library_spells"]) {
        expect(callsOn(table)).toContainEqual({ table, method: "in", args: ["source", ["srd-2024", "kp-bestiary"]] });
        expect(callsOn(table)).toContainEqual({ table, method: "eq", args: ["ruleset", "2024"] });
      }
    });

    it("applies the edition to custom monsters and spells too", async () => {
      await run();
      for (const table of ["monsters", "spells"]) {
        expect(callsOn(table)).toContainEqual({ table, method: "or", args: [expect.stringContaining("ruleset.eq.2024")] });
      }
    });

    it("skips the library reads entirely when no book is enabled", async () => {
      mocks.slugs = [];
      const search = await run();
      expect(mocks.from).not.toHaveBeenCalledWith("library_monsters");
      expect(mocks.from).not.toHaveBeenCalledWith("library_spells");
      expect(mocks.from).toHaveBeenCalledWith("monsters");
      expect(search.data.value?.failedGroups).toEqual([]);
    });

    it("waits for the enabled books before searching", async () => {
      mocks.slugs = null;
      await run();
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it("keeps a different book list or edition from reusing the cached answer", async () => {
      await run();
      mocks.ruleset = "2014";
      await run();
      expect(callsOn("library_monsters").filter((c) => c.method === "eq" && c.args[0] === "ruleset").map((c) => c.args[1]))
        .toEqual(["2024", "2014"]);
    });
  });

  describe("thumbnails", () => {
    it("resolves NPC and library monster art for the rows shown, with the DM's art laid over", async () => {
      mocks.byTable = {
        npcs: { data: [{ id: "n1", name: "Goblin Queen", disguise_name: null, portrait_url: "queen.webp", portrait_focal_point: { x: 40, y: 20 } }], error: null },
        library_monsters: { data: [{ id: "srd_goblin", name: "Goblin", image_url: "canon.webp", portrait_focal_point: null }], error: null },
      };
      mocks.fetchArt.mockResolvedValue({ srd_goblin: { image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 10, y: 10 } } });
      const search = await run();
      await vi.advanceTimersByTimeAsync(10);
      expect(search.thumbnails.value).toEqual({
        n1: { src: "queen.webp", focalPoint: { x: 40, y: 20 } },
        srd_goblin: { src: "mine.webp", focalPoint: { x: 10, y: 10 } },
      });
      expect(mocks.fetchArt).toHaveBeenCalledWith(["srd_goblin"]);
    });

    it("reads nothing when no NPC or monster is on screen", async () => {
      mocks.byTable = { notes: { data: [{ id: "n1", title: "Goblin ledger" }], error: null } };
      const search = await run();
      expect(search.thumbnails.value).toEqual({});
      expect(mocks.fetchArt).not.toHaveBeenCalled();
    });

    it("reports a failed art read and leaves the search untouched", async () => {
      mocks.byTable = { library_monsters: { data: [{ id: "srd_goblin", name: "Goblin", image_url: "c.webp", portrait_focal_point: null }], error: null } };
      const boom = new Error("art down");
      mocks.fetchArt.mockRejectedValue(boom);
      const search = await run();
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.report).toHaveBeenCalledWith(boom, "search-thumbnails");
      expect(search.thumbnails.value).toEqual({});
      expect(search.data.value?.groups.map((g) => g.type)).toEqual(["monster"]);
    });
  });

  describe("by meaning", () => {
    const hit = (over: Record<string, unknown>) => ({
      kind: "location", id: "l1", name: "The Pulled Sugar Inn", descriptor: "an inn run by a retired performer", distance: 0.2, ...over,
    });

    async function runSemantic() {
      const query = ref("the inn run by a performer");
      const search = mount(() => useGlobalSearch(query));
      await vi.advanceTimersByTimeAsync(SEMANTIC_DEBOUNCE_MS * 2);
      return search;
    }

    it("waits for the longer pause and sends one request", async () => {
      const query = ref("");
      mount(() => useGlobalSearch(query));
      for (const typed of ["the", "the i", "the inn"]) {
        query.value = typed;
        await vi.advanceTimersByTimeAsync(SEMANTIC_DEBOUNCE_MS / 2);
      }
      expect(mocks.invoke).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(SEMANTIC_DEBOUNCE_MS);
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      expect(mocks.invoke).toHaveBeenCalledWith("search-campaign", { body: { query: "the inn", campaign_id: "campaign-1" } });
    });

    it("merges meaning hits into the groups with their descriptor", async () => {
      mocks.invoke.mockResolvedValue({ data: { hits: [hit({})] }, error: null });
      const search = await runSemantic();
      const locations = search.data.value?.groups.find((g) => g.type === "location");
      expect(locations?.items[0]).toMatchObject({
        name: "The Pulled Sugar Inn",
        descriptor: "an inn run by a retired performer",
        matchedBy: "meaning",
      });
      expect(search.isSemanticPending.value).toBe(false);
    });

    it("is pending while in flight and keyword results are not held back", async () => {
      mocks.byTable = { notes: { data: [{ id: "n1", title: "Inn ledger" }], error: null } };
      mocks.invoke.mockReturnValue(new Promise(() => {}));
      const search = await runSemantic();
      expect(search.isSemanticPending.value).toBe(true);
      expect(search.data.value?.groups.map((g) => g.type)).toEqual(["note"]);
    });

    it.each([
      ["a child account", { data: { hits: [hit({})], unavailable: "child_account" }, error: null }],
      ["a missing vendor", { data: { hits: [], unavailable: "embedding_provider_unavailable" }, error: null }],
      ["a rate limit", { data: { hits: [], unavailable: "rate_limited" }, error: null }],
    ])("adds nothing for %s and reports nothing", async (_name, reply) => {
      mocks.invoke.mockResolvedValue(reply);
      const search = await runSemantic();
      expect(search.data.value?.groups).toEqual([]);
      expect(mocks.report).not.toHaveBeenCalled();
    });

    it("treats a 403 as no hits without reporting", async () => {
      mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 403 } } });
      const search = await runSemantic();
      expect(search.data.value?.groups).toEqual([]);
      expect(search.isError.value).toBe(false);
      expect(mocks.report).not.toHaveBeenCalled();
    });

    it("reports any other failure and still shows the keyword results", async () => {
      mocks.byTable = { notes: { data: [{ id: "n1", title: "Inn ledger" }], error: null } };
      const boom = { context: { status: 500 } };
      mocks.invoke.mockResolvedValue({ data: null, error: boom });
      const search = await runSemantic();
      expect(mocks.report).toHaveBeenCalledWith(boom, "campaign-search");
      expect(search.isError.value).toBe(false);
      expect(search.data.value?.groups.map((g) => g.type)).toEqual(["note"]);
    });

    it("never fires for a player, a free account, below three letters, or without a campaign", async () => {
      mocks.isDM = false;
      await runSemantic();
      expect(mocks.invoke).not.toHaveBeenCalled();

      mocks.isDM = true;
      mocks.isPro = false;
      const free = await runSemantic();
      expect(mocks.invoke).not.toHaveBeenCalled();
      // Not "searching by meaning" forever: the tier is simply not there.
      expect(free.isSemanticPending.value).toBe(false);
      mocks.isPro = true;

      mocks.isDM = true;
      const short = ref("in");
      mount(() => useGlobalSearch(short));
      await vi.advanceTimersByTimeAsync(SEMANTIC_DEBOUNCE_MS * 2);
      expect(mocks.invoke).not.toHaveBeenCalled();

      mocks.campaignId = null;
      await runSemantic();
      expect(mocks.invoke).not.toHaveBeenCalled();
    });
  });
  describe("Pro upsell", () => {
    async function runUpsell(term = "the pig tavern") {
      const query = ref(term);
      const search = mount(() => useGlobalSearch(query));
      await vi.advanceTimersByTimeAsync(SEMANTIC_DEBOUNCE_MS * 2);
      return search;
    }

    it("shows for a free DM whose search found little by name", async () => {
      mocks.isPro = false;
      mocks.byTable = { notes: { data: [{ id: "n1", title: "Pig ledger" }], error: null } };
      const search = await runUpsell();
      expect(search.showProUpsell.value).toBe(true);
    });

    it("stays away when the name search already found plenty", async () => {
      mocks.isPro = false;
      mocks.byTable = { notes: { data: [{ id: "n1", title: "a" }, { id: "n2", title: "b" }, { id: "n3", title: "c" }], error: null } };
      const search = await runUpsell("plenty");
      expect(search.showProUpsell.value).toBe(false);
    });

    it("never shows to a Pro account, a child, a player, or while the plan loads", async () => {
      expect((await runUpsell("pro account")).showProUpsell.value).toBe(false);

      mocks.isPro = false;
      mocks.isChild = true;
      expect((await runUpsell("child account")).showProUpsell.value).toBe(false);

      mocks.isChild = false;
      mocks.isDM = false;
      expect((await runUpsell("player account")).showProUpsell.value).toBe(false);

      mocks.isDM = true;
      mocks.subscriptionLoading = true;
      expect((await runUpsell("plan loading")).showProUpsell.value).toBe(false);
    });

    it("stays dismissed in this browser once dismissed", async () => {
      mocks.isPro = false;
      const first = await runUpsell("dismiss me");
      expect(first.showProUpsell.value).toBe(true);
      first.dismissProUpsell();
      expect(first.showProUpsell.value).toBe(false);
      await nextTick();
      expect(localStorage.getItem(PRO_UPSELL_DISMISSED_KEY)).toBe("true");
      expect((await runUpsell("another term")).showProUpsell.value).toBe(false);
    });
  });
});
