import { defineComponent, h, ref } from "vue";
import type { Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { PlayerSitePlan, PlayerSitePlanSpace } from "./usePlayerVisibleSiteState";

// Plain top-level `ref()`s: the mock factories below only close over these, they don't read `.value`
// until a test actually mounts something, by which point these are assigned.
const dmPreviewMode = ref(false);
const dmPreviewPartyMemberId = ref<string | null>(null);

vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({
    get dmPreviewMode() { return dmPreviewMode.value; },
    get dmPreviewPartyMemberId() { return dmPreviewPartyMemberId.value; },
  }),
}));

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

const emptyDoc = { spaces: [], glimpsed: [], ways: [], zones: [] };

const { exploredRooms, parsePlayerSitePlan, usePlayerVisibleSiteState, wayCount } = await import(
  "./usePlayerVisibleSiteState"
);

function mountWidget(siteId: string, previewRef?: Ref<string | null>, enabledRef?: Ref<boolean>) {
  let query!: ReturnType<typeof usePlayerVisibleSiteState>;
  mount(
    defineComponent({
      setup() {
        query = usePlayerVisibleSiteState(ref(siteId), previewRef, enabledRef);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return query;
}

/**
 * The projection answers by who is looking: only the previewed member has
 * explored a room, and only on this site. Anyone else gets the empty plan.
 */
function exploredBy(memberId: string | null) {
  fake.onRpc("get_player_visible_site_state", (args) =>
    args.p_site_location_id === "site-1" && args.p_preview_party_member_id === memberId
      ? { ...emptyDoc, spaces: [space({ name: "Flooded Nave" })] }
      : emptyDoc,
  );
}

const roomNames = (q: ReturnType<typeof mountWidget>) => q.data.value?.spaces.map((s) => s.name);

describe("usePlayerVisibleSiteState", () => {
  beforeEach(() => {
    fake.reset();
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = null;
  });

  it("asks as no particular member by default", async () => {
    exploredBy(null);
    const q = mountWidget("site-1");
    await flushPromises();
    expect(roomNames(q)).toEqual(["Flooded Nave"]);
  });

  // The DM-preview hole this closes: a DM's own campaign_members row has a
  // null party_member_id, so without this the RPC would always see "not
  // this party member" and the previewed journal's plan would show nothing.
  it("asks about the site it was given, not another", async () => {
    exploredBy(null);
    const q = mountWidget("site-2");
    await flushPromises();
    expect(roomNames(q)).toEqual([]);
  });

  it("falls back to the DM's global preview audience when no explicit ref is given", async () => {
    dmPreviewMode.value = true;
    dmPreviewPartyMemberId.value = "member-1";
    exploredBy("member-1");
    const q = mountWidget("site-1");
    await flushPromises();
    expect(roomNames(q)).toEqual(["Flooded Nave"]);
  });

  it("prefers an explicit preview ref over the global DM preview state", async () => {
    dmPreviewMode.value = true;
    dmPreviewPartyMemberId.value = "global-member";
    exploredBy("explicit-member");
    const q = mountWidget("site-1", ref("explicit-member"));
    await flushPromises();
    expect(roomNames(q)).toEqual(["Flooded Nave"]);
  });

  it("does not read the global preview state outside of DM preview mode", async () => {
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = "stale-member";
    exploredBy(null);
    const q = mountWidget("site-1");
    await flushPromises();
    expect(roomNames(q)).toEqual(["Flooded Nave"]);
  });

  // #884, wave 4, S12: `MapLayersPanel`'s "preview as players" toggle
  // gates the query on an `enabled` ref until a DM has actually chosen an
  // audience — every other caller omits it and is unaffected (default true).
  it("does not query at all while an explicit enabled ref is false, and does once it flips true", async () => {
    exploredBy("member-1");
    const enabled = ref(false);
    const q = mountWidget("site-1", ref("member-1"), enabled);
    await flushPromises();
    expect(fake.calls).toEqual([]);
    enabled.value = true;
    await flushPromises();
    expect(roomNames(q)).toEqual(["Flooded Nave"]);
  });

  it("surfaces a failed read and a malformed plan as errors, never as an empty plan", async () => {
    fake.failNext("get_player_visible_site_state", { message: "boom" });
    const failed = mountWidget("site-1");
    await vi.waitFor(() => expect(failed.isError.value).toBe(true));

    fake.onRpc("get_player_visible_site_state", () => ({ spaces: [] }));
    const malformed = mountWidget("site-2");
    await vi.waitFor(() => expect(malformed.isError.value).toBe(true));
  });
});

describe("parsePlayerSitePlan", () => {
  it("passes the four arrays through unchanged", () => {
    const doc = {
      spaces: [{ space_location_id: "room-a" }],
      glimpsed: [{ cells: ["0,0"] }],
      ways: [{ from_space_id: "room-a" }],
      zones: [{ zone_kind: "hazard" }],
    };
    expect(parsePlayerSitePlan(doc)).toEqual(doc);
  });

  it.each([
    null, undefined, "a string", 42, {}, { spaces: [] },
    { glimpsed: [], ways: [], zones: [] },
    { spaces: [], ways: [], zones: [] },
    { spaces: [], glimpsed: [], zones: [] },
    { spaces: [], glimpsed: [], ways: [] },
  ])(
    "throws rather than silently downgrading an unexpected shape (%j)",
    (value) => {
      expect(() => parsePlayerSitePlan(value)).toThrow();
    },
  );
});

function space(overrides: Partial<PlayerSitePlanSpace> = {}): PlayerSitePlanSpace {
  return {
    space_location_id: "room-a",
    name: "Flooded Nave",
    cells: ["0,0"],
    label: null,
    sort_order: null,
    is_cleared: false,
    is_looted: false,
    ...overrides,
  };
}

function plan(overrides: Partial<PlayerSitePlan> = {}): PlayerSitePlan {
  return { spaces: [], glimpsed: [], ways: [], zones: [], ...overrides };
}

describe("exploredRooms", () => {
  // A room traced as more than one shape must still read as one room in a
  // list — `PlayerSitePlan.vue` is the layer that draws every shape.
  it("folds multiple traced shapes bound to the same room into one entry", () => {
    const spaces = [
      space({ space_location_id: "room-a", cells: ["0,0"] }),
      space({ space_location_id: "room-a", cells: ["1,0"] }),
    ];
    expect(exploredRooms(plan({ spaces }))).toHaveLength(1);
  });

  it("sorts by sort_order (nulls last), then by name", () => {
    const spaces = [
      space({ space_location_id: "c", name: "Charlie", sort_order: null }),
      space({ space_location_id: "b", name: "Bravo", sort_order: 1 }),
      space({ space_location_id: "a", name: "Alpha", sort_order: null }),
    ];
    expect(exploredRooms(plan({ spaces })).map((r) => r.spaceLocationId)).toEqual(["b", "a", "c"]);
  });

  it("keeps independently-explored rooms separate", () => {
    const spaces = [
      space({ space_location_id: "room-a", name: "Alpha", is_cleared: true }),
      space({ space_location_id: "room-b", name: "Bravo", is_looted: true }),
    ];
    const result = exploredRooms(plan({ spaces }));
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.spaceLocationId === "room-a")).toMatchObject({ isCleared: true, isLooted: false });
    expect(result.find((r) => r.spaceLocationId === "room-b")).toMatchObject({ isCleared: false, isLooted: true });
  });
});

describe("wayCount", () => {
  it("counts every way the plan carries, known-edge or not", () => {
    const ways: PlayerSitePlan["ways"] = [
      { from_space_id: "room-a", to_space_id: "room-b", door_kind: "door", edge_key: "0,0:N" },
      { from_space_id: "room-a", to_space_id: null, door_kind: "arch", edge_key: null },
    ];
    expect(wayCount(plan({ ways }))).toBe(2);
  });
});
