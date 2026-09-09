import { defineComponent, h, ref } from "vue";
import type { Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { PlayerSitePlan, PlayerSitePlanSpace } from "./usePlayerVisibleSiteState";

// Plain top-level `ref()`s, mirroring `LocationSheet.test.ts`'s ui-store mock:
// the mock factories below only close over these, they don't read `.value`
// until a test actually mounts something, by which point these are assigned.
const dmPreviewMode = ref(false);
const dmPreviewPartyMemberId = ref<string | null>(null);

vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({
    get dmPreviewMode() { return dmPreviewMode.value; },
    get dmPreviewPartyMemberId() { return dmPreviewPartyMemberId.value; },
  }),
}));

const emptyDoc = { spaces: [], glimpsed: [], ways: [], zones: [] };
const rpc = vi.fn().mockResolvedValue({ data: emptyDoc, error: null });
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

// Imported after the mocks above (same idiom as `useStoreItems.test.ts`): a
// static import of the module under test would resolve its own
// `@/lib/supabase` import while THIS file's top-level body is still being
// evaluated, i.e. before `const rpc` exists — a real TDZ crash, not a
// theoretical one, hit while writing this test.
const { exploredRooms, parsePlayerSitePlan, usePlayerVisibleSiteState, wayCount } = await import(
  "./usePlayerVisibleSiteState"
);

function mountWidget(siteId: string, previewRef?: Ref<string | null>) {
  mount(
    defineComponent({
      setup() {
        usePlayerVisibleSiteState(ref(siteId), previewRef);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
}

describe("usePlayerVisibleSiteState", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockResolvedValue({ data: emptyDoc, error: null });
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = null;
  });

  it("passes no preview audience by default", async () => {
    mountWidget("site-1");
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_visible_site_state", {
      p_site_location_id: "site-1",
      p_preview_party_member_id: null,
    });
  });

  // The DM-preview hole this closes: a DM's own campaign_members row has a
  // null party_member_id, so without this the RPC would always see "not
  // this party member" and the previewed journal's plan would show nothing.
  it("falls back to the DM's global preview audience when no explicit ref is given", async () => {
    dmPreviewMode.value = true;
    dmPreviewPartyMemberId.value = "member-1";
    mountWidget("site-1");
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_visible_site_state", {
      p_site_location_id: "site-1",
      p_preview_party_member_id: "member-1",
    });
  });

  it("prefers an explicit preview ref over the global DM preview state", async () => {
    dmPreviewMode.value = true;
    dmPreviewPartyMemberId.value = "global-member";
    mountWidget("site-1", ref("explicit-member"));
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_visible_site_state", {
      p_site_location_id: "site-1",
      p_preview_party_member_id: "explicit-member",
    });
  });

  it("does not read the global preview state outside of DM preview mode", async () => {
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = "stale-member";
    mountWidget("site-1");
    await flushPromises();
    expect(rpc).toHaveBeenCalledWith("get_player_visible_site_state", {
      p_site_location_id: "site-1",
      p_preview_party_member_id: null,
    });
  });
});

describe("parsePlayerSitePlan", () => {
  it("accepts the RPC's own empty document", () => {
    expect(parsePlayerSitePlan(emptyDoc)).toEqual(emptyDoc);
  });

  it("passes the four arrays through unchanged", () => {
    const doc = {
      spaces: [{ space_location_id: "room-a" }],
      glimpsed: [{ cells: ["0,0"] }],
      ways: [{ from_space_id: "room-a" }],
      zones: [{ zone_kind: "hazard" }],
    };
    expect(parsePlayerSitePlan(doc)).toEqual(doc);
  });

  it.each([null, undefined, "a string", 42, {}, { spaces: [] }])(
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
  it("returns an empty list for no spaces", () => {
    expect(exploredRooms(plan())).toEqual([]);
  });

  it("returns one entry per room", () => {
    expect(exploredRooms(plan({ spaces: [space()] }))).toEqual([
      { spaceLocationId: "room-a", name: "Flooded Nave", isCleared: false, isLooted: false },
    ]);
  });

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

  it("carries the cleared/looted facts through", () => {
    const spaces = [space({ is_cleared: true, is_looted: true })];
    expect(exploredRooms(plan({ spaces }))[0]).toMatchObject({ isCleared: true, isLooted: true });
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
  it("is zero for a plan with no known ways", () => {
    expect(wayCount(plan())).toBe(0);
  });

  it("counts every way the plan carries, known-edge or not", () => {
    const ways: PlayerSitePlan["ways"] = [
      { from_space_id: "room-a", to_space_id: "room-b", door_kind: "door", source_edge_key: "0,0:N" },
      { from_space_id: "room-a", to_space_id: null, door_kind: "arch", source_edge_key: null },
    ];
    expect(wayCount(plan({ ways }))).toBe(2);
  });
});
