import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Location } from "@/types/location.types";

/**
 * #596: locations flip from "new content defaults to global" to "new content
 * defaults to the active campaign", and — unlike items/spells/species, which
 * already read `campaign_id IS NULL` as "every campaign" — the location list
 * queries had never picked that convention up at all. A `campaign_id: null`
 * location was accepted by every write path (RLS already allowed it) and then
 * silently invisible in the Atlas, because `fetchLocations`/`fetchAllLocations`
 * filtered with `.eq("campaign_id", campaignId)`, which never matches NULL.
 *
 * These tests cover the three behaviours #596 asks for: a new location is
 * created against the active campaign, an explicit "no campaign" choice is
 * respected rather than coerced back to active, and a global row still comes
 * back from the campaign-scoped list read (the fix for the bug above).
 */

const activeCampaignId = ref<string | null>("campaign-1");

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() { return activeCampaignId.value; },
  }),
}));

vi.mock("@/stores/ui", () => ({ useUiStore: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));
vi.mock("@/lib/storage", () => ({ deleteByPublicUrl: vi.fn() }));
vi.mock("@/lib/reorder", () => ({ persistReorder: vi.fn(), toReorderEntries: vi.fn() }));
vi.mock("@/lib/populateSetting/settingContent", () => ({
  matchSettingRowIds: vi.fn(),
  stampSettingSource: vi.fn(),
  PLANAR_SOURCE: "planar",
}));
vi.mock("@/data/settingLocations", () => ({ SETTING_LOCATIONS: [], PLANAR_LOCATIONS: [] }));

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as { method: string; args: unknown[] }[],
  insertPayload: null as Record<string, unknown> | null,
}));

/** Chainable stand-in for supabase-js's PostgrestFilterBuilder: every filter
 *  method records what it was called with and returns the chain, which is a
 *  genuine resolved Promise (not a hand-rolled `then`, which oxlint's
 *  no-thenable rule flags) — so `await` on it, or on any method call's return
 *  value, resolves with the row set the test configured. That's what lets a
 *  call site that switches from `.or(...)` back to `.eq(...)` change what
 *  gets recorded without the test needing to model supabase's real SQL
 *  semantics. */
function makeQueryChain() {
  const chain = Promise.resolve({ data: mocks.rows, error: null }) as
    Promise<{ data: unknown[]; error: null }> & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ["select", "eq", "or", "is", "order"]) {
    chain[method] = (...args: unknown[]) => {
      mocks.calls.push({ method, args });
      return chain;
    };
  }
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        mocks.calls.push({ method: "select", args });
        return makeQueryChain();
      },
      insert: (payload: Record<string, unknown>) => {
        mocks.insertPayload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "new-loc", ...payload }, error: null }),
          }),
        };
      },
    }),
    // useCreateLocation queues a post-save embed — fire-and-forget, not under
    // test here, but it runs synchronously off onSuccess so it still needs a
    // real (no-op) implementation to avoid an unhandled-property crash.
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
  getCurrentUser: () => ({ id: "user-1" }),
}));

const {
  useCreateLocation,
  useAllLocations,
} = await import("@/composables/locations/useLocations");

function place(over: Partial<Location> & { id: string }): Location {
  return {
    user_id: "u", campaign_id: "c", parent_id: null, name: over.id,
    location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, map_pins: [], is_map_shared: false,
    player_visible_to: [], player_summary: null, is_description_shared: false,
    is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false,
    grid_calibration: null, era_start: null, era_end: null,
    audio_theme: null, sort_order: null, created_at: "", updated_at: "",
    ...over,
  } as Location;
}

/** Mounts `setup` inside a real component tree with a fresh VueQueryPlugin,
 *  matching useStoreItems.test.ts's convention — vue-query's hooks throw
 *  outside an active injection context, so a bare function call isn't enough.
 *  Stays mounted (query observers unsubscribe on unmount) until the caller is
 *  done with `result`. */
function withQueryClient<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return { result, unmount: () => wrapper.unmount() };
}

describe("useCreateLocation", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.insertPayload = null;
  });

  it("stamps the active campaign when the caller has no opinion on scope", async () => {
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync({ name: "Tower" } as never);
    expect(mocks.insertPayload?.campaign_id).toBe("campaign-1");
    unmount();
  });

  it("keeps an explicit null — the DM's deliberate 'every campaign' choice — rather than coercing it back to active", async () => {
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync({ name: "The Wandering Inn", campaign_id: null } as never);
    expect(mocks.insertPayload?.campaign_id).toBeNull();
    unmount();
  });

  it("creates global when there is genuinely no active campaign and the caller has no opinion", async () => {
    activeCampaignId.value = null;
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync({ name: "Orphaned Keep" } as never);
    expect(mocks.insertPayload?.campaign_id).toBeNull();
    unmount();
  });
});

describe("location list reads", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.calls = [];
  });

  it("still returns a global (campaign_id null) location alongside campaign-scoped ones", async () => {
    const globalRoom = place({ id: "global-shrine", campaign_id: null });
    const campaignRoom = place({ id: "campaign-tower", campaign_id: "campaign-1" });
    mocks.rows = [globalRoom, campaignRoom];

    const { result: query, unmount } = withQueryClient(() => useAllLocations());
    await flushPromises();

    expect((query.data.value ?? []).map((l) => l.id)).toEqual(["global-shrine", "campaign-tower"]);
    // The filter must be widened rather than an exact match, or the global
    // row above would already have been silently dropped by supabase.
    const orCall = mocks.calls.find((c) => c.method === "or");
    expect(orCall?.args[0]).toBe("campaign_id.eq.campaign-1,campaign_id.is.null");
    unmount();
  });
});
