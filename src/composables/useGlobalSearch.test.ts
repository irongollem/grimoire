import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  result: { data: [] as unknown[], error: null as unknown },
  /** Per-table override; falls back to `result`. */
  byTable: {} as Record<string, { data: unknown[] | null; error: unknown }>,
  report: vi.fn(),
}));

vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));

/** Any PostgREST chain (`.select().eq().ilike().limit()`...) resolving to `mocks.result`. */
function chain(table: string): unknown {
  const builder: Record<string, unknown> = {};
  return new Proxy(builder, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(mocks.byTable[table] ?? mocks.result);
      return () => chain(table);
    },
  });
}

vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => { mocks.from(table); return chain(table); } } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));

import { SEARCH_DEBOUNCE_MS, useGlobalSearch } from "./useGlobalSearch";

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

/** Nine tables per search: notes, npcs, monsters, library_monsters, spells,
 *  library_spells, items, locations, quests. */
const TABLES_PER_SEARCH = 9;

describe("useGlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.from.mockReset();
    mocks.result = { data: [], error: null };
    mocks.byTable = {};
    mocks.report.mockReset();
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
});
