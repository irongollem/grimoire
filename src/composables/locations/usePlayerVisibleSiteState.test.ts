import { defineComponent, h, ref } from "vue";
import type { Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { PlayerVisibleSiteRoom } from "./usePlayerVisibleSiteState";

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

const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

// Imported after the mocks above (same idiom as `useStoreItems.test.ts`): a
// static import of the module under test would resolve its own
// `@/lib/supabase` import while THIS file's top-level body is still being
// evaluated, i.e. before `const rpc` exists — a real TDZ crash, not a
// theoretical one, hit while writing this test.
const { groupExploredRooms, usePlayerVisibleSiteState } = await import("./usePlayerVisibleSiteState");

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
  // this party member" and the previewed journal's map would show no rooms.
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

function room(overrides: Partial<PlayerVisibleSiteRoom> = {}): PlayerVisibleSiteRoom {
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

describe("groupExploredRooms", () => {
  it("returns an empty list for no rows", () => {
    expect(groupExploredRooms([])).toEqual([]);
  });

  it("returns one entry per room", () => {
    expect(groupExploredRooms([room()])).toEqual([
      { spaceLocationId: "room-a", name: "Flooded Nave", isCleared: false, isLooted: false },
    ]);
  });

  // A room traced as more than one shape must still read as one room in a
  // list — the map overlay is the layer that draws every shape.
  it("folds multiple traced shapes bound to the same room into one entry", () => {
    const rows = [
      room({ space_location_id: "room-a", cells: ["0,0"] }),
      room({ space_location_id: "room-a", cells: ["1,0"] }),
    ];
    expect(groupExploredRooms(rows)).toHaveLength(1);
  });

  it("sorts by sort_order (nulls last), then by name", () => {
    const rows = [
      room({ space_location_id: "c", name: "Charlie", sort_order: null }),
      room({ space_location_id: "b", name: "Bravo", sort_order: 1 }),
      room({ space_location_id: "a", name: "Alpha", sort_order: null }),
    ];
    expect(groupExploredRooms(rows).map((r) => r.spaceLocationId)).toEqual(["b", "a", "c"]);
  });

  it("carries the cleared/looted facts through", () => {
    const rows = [room({ is_cleared: true, is_looted: true })];
    expect(groupExploredRooms(rows)[0]).toMatchObject({ isCleared: true, isLooted: true });
  });

  it("keeps independently-explored rooms separate", () => {
    const rows = [
      room({ space_location_id: "room-a", name: "Alpha", is_cleared: true }),
      room({ space_location_id: "room-b", name: "Bravo", is_looted: true }),
    ];
    const result = groupExploredRooms(rows);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.spaceLocationId === "room-a")).toMatchObject({ isCleared: true, isLooted: false });
    expect(result.find((r) => r.spaceLocationId === "room-b")).toMatchObject({ isCleared: false, isLooted: true });
  });
});
