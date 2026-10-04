import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  result: { data: [] as unknown[], error: null as unknown },
}));

/** Any PostgREST chain (`.select().eq().ilike().limit()`...) resolving to `mocks.result`. */
function chain(): unknown {
  const builder: Record<string, unknown> = {};
  return new Proxy(builder, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(mocks.result);
      return () => chain();
    },
  });
}

vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => { mocks.from(table); return chain(); } } }));
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

  it("reports a failed table as an error instead of an empty result", async () => {
    mocks.result = { data: null as unknown as unknown[], error: { message: "permission denied" } };
    const query = ref("goblin");
    const search = mount(() => useGlobalSearch(query));
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    expect(search.isError.value).toBe(true);
  });
});
