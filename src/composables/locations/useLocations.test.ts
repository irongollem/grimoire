import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Location, LocationInsert, LocationType } from "@/types/location.types";
import { LOCATION_SUMMARY_SELECT } from "@/types/location.types";
import type { LocationPreset } from "@/data/settingLocations";

/**
 * #596: locations flip from "new content defaults to global" to "new content
 * defaults to the active campaign", and a `campaign_id: null` location must
 * stay visible in the Atlas: the list reads scope with `campaign_id.eq.X OR
 * (campaign_id IS NULL AND owner)`, never `.eq("campaign_id", X)`, which never
 * matches NULL. The fake does not interpret `or(...)`, so the scope is checked
 * on the request itself.
 */

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  deleteUnreferenced: vi.fn(),
  stamp: vi.fn(),
  embed: vi.fn(),
}));

const activeCampaignId = ref<string | null>("campaign-1");
const ownerId = ref<string | null>(null);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() { return activeCampaignId.value; },
    get activeCampaign() { return ownerId.value === null ? null : { user_id: ownerId.value }; },
  }),
}));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));
vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: mocks.deleteUnreferenced }));
vi.mock("@/lib/reorder", () => ({ persistReorder: vi.fn(), toReorderEntries: vi.fn() }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: mocks.embed }));
vi.mock("@/lib/populateSetting/settingContent", () => ({
  // The real matcher is by lowercase name; reproduce just that.
  matchSettingRowIds: (rows: { id: string; name: string }[], names: string[]) =>
    rows.filter((r) => names.some((n) => n.toLowerCase() === r.name.toLowerCase())).map((r) => r.id),
  stampSettingSource: mocks.stamp,
  PLANAR_SOURCE: "planar",
}));
vi.mock("@/data/settingLocations", () => ({ PLANAR_LOCATIONS: [] }));
vi.mock("@/lib/supabase", () => ({
  supabase: { ...fake.client, functions: { invoke: mocks.invoke } },
  getCurrentUser: () => ({ id: "user-1" }),
}));

const {
  getPinnableDescendants,
  insertSettingLocations,
  useCreateLocation,
  useUpdateLocation,
  useUpdateLocationPicture,
  useSaveStyledSitePicture,
  useDeleteLocation,
  useAllLocations,
  useLocation,
  useLocations,
} = await import("@/composables/locations/useLocations");

function place(over: Partial<Location> & { id: string }): Record<string, unknown> {
  return { user_id: "u", campaign_id: "campaign-1", parent_id: null, name: over.id, location_type: "building", sort_order: null, ...over };
}

/** A full insert for a new place, named `name`. */
function newPlace(name: string, over: Partial<LocationInsert> = {}): LocationInsert {
  return {
    campaign_id: "campaign-1", parent_id: null, name, location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, map_pins: [], is_map_shared: false, player_visible_to: [], player_summary: null,
    is_description_shared: false, is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false, grid_calibration: null, era_start: null, era_end: null,
    ...over,
  };
}

function withQueryClient<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return { result, unmount: () => wrapper.unmount() };
}

beforeEach(() => {
  fake.reset();
  activeCampaignId.value = "campaign-1";
  ownerId.value = null;
  mocks.invoke.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.deleteUnreferenced.mockReset();
  mocks.stamp.mockReset();
  mocks.embed.mockReset();
});

describe("getPinnableDescendants", () => {
  const loc = (id: string, parent_id: string | null, location_type: LocationType) => ({
    id, parent_id, location_type, name: id, image_url: null,
  });

  it("walks through a region to the places inside it and records the chain it crossed", () => {
    const found = getPinnableDescendants("world", [
      loc("north", "world", "region"),
      loc("tower", "north", "building"),
      loc("town", "world", "city"),
    ]);
    expect(found.map((f) => [f.id, f.parent_chain])).toEqual([["tower", ["north"]], ["town", []]]);
  });

  it("keeps an empty region as a pin of its own", () => {
    expect(getPinnableDescendants("world", [loc("empty", "world", "region")]).map((f) => f.id)).toEqual(["empty"]);
  });

  it("never offers a room, which a site's floor plan places rather than a pin", () => {
    expect(getPinnableDescendants("keep", [loc("hall", "keep", "room"), loc("yard", "keep", "building")]).map((f) => f.id)).toEqual(["yard"]);
  });

  it("stops at sixty pins", () => {
    const many = Array.from({ length: 70 }, (_, i) => loc(`b${i}`, "world", "building"));
    expect(getPinnableDescendants("world", many)).toHaveLength(60);
  });

  it("a loop of regions parenting each other yields nothing, rather than the same place again and again", () => {
    expect(getPinnableDescendants("a", [loc("a", "b", "region"), loc("b", "a", "region")])).toEqual([]);
  });
});

describe("useCreateLocation", () => {
  it("stamps the active campaign when the caller has no opinion on scope", async () => {
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync(newPlace("Tower", { campaign_id: undefined }));
    expect(fake.rows("locations")).toMatchObject([{ name: "Tower", campaign_id: "campaign-1", user_id: "user-1" }]);
    unmount();
  });

  it("keeps an explicit null, the DM's deliberate 'every campaign' choice, rather than coercing it back to active", async () => {
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync(newPlace("The Wandering Inn", { campaign_id: null }));
    expect(fake.rows("locations")[0]?.campaign_id).toBeNull();
    unmount();
  });

  it("creates global when there is genuinely no active campaign and the caller has no opinion", async () => {
    activeCampaignId.value = null;
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    await result.mutateAsync(newPlace("Orphaned Keep", { campaign_id: undefined }));
    expect(fake.rows("locations")[0]?.campaign_id).toBeNull();
    unmount();
  });

  it("queues the new place for embedding", async () => {
    const { result, unmount } = withQueryClient(() => useCreateLocation());
    // The fake mints no ids, so the new row is given one the way the database would.
    const input = { ...newPlace("Tower", { campaign_id: undefined }), id: "loc-new" };
    const created = await result.mutateAsync(input);
    expect(mocks.invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "single", entity: "location", id: created.id } });
    unmount();
  });
});

describe("location list reads", () => {
  it.each([
    ["a campaign owner", null, "campaign_id.eq.campaign-1,and(campaign_id.is.null,user_id.in.(user-1))"],
    ["a co-DM, who also reads the owner's library places (#590)", "owner-1", "campaign_id.eq.campaign-1,and(campaign_id.is.null,user_id.in.(user-1,owner-1))"],
  ])("scopes the flat list for %s to the campaign's places plus the caller's global ones", async (_who, owner, expected) => {
    ownerId.value = owner;
    const { unmount } = withQueryClient(() => useAllLocations());
    await flushPromises();
    const read = fake.calls.find((c) => c.target === "locations");
    expect(read?.filters).toContainEqual({ op: "or", column: "", value: expected });
    unmount();
  });

  it("loads the slim summary columns, never every column", async () => {
    const { unmount } = withQueryClient(() => useAllLocations());
    await flushPromises();
    const columns = fake.calls.find((c) => c.target === "locations")?.columns;
    expect(columns).toBe(LOCATION_SUMMARY_SELECT);
    for (const heavy of ["description", "notes", "map_pins"]) expect(String(columns).split(", ")).not.toContain(heavy);
    unmount();
  });

  it("reads nothing without an active campaign", async () => {
    activeCampaignId.value = null;
    const { unmount } = withQueryClient(() => useAllLocations());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    unmount();
  });

  it("holds a children query whose parent is not known yet, then lists just that parent's children", async () => {
    fake.seed("locations", [
      place({ id: "root" }),
      place({ id: "room-b", parent_id: "site-1", name: "B", sort_order: 1 }),
      place({ id: "room-a", parent_id: "site-1", name: "A" }),
      place({ id: "room-c", parent_id: "site-1", name: "C", sort_order: 0 }),
      place({ id: "elsewhere", parent_id: "site-2" }),
    ]);
    const parent = ref<string | null>("");
    const { result: query, unmount } = withQueryClient(() => useLocations(parent));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(query.fetchStatus.value).toBe("idle");
    expect(query.isError.value).toBe(false);

    parent.value = "site-1";
    await vi.waitFor(() => expect(query.data.value?.map((l) => l.id)).toEqual(["room-c", "room-b", "room-a"]));
    unmount();
  });

  it("lists only the roots for a null parent", async () => {
    fake.seed("locations", [place({ id: "root" }), place({ id: "child", parent_id: "root" })]);
    const { result: query, unmount } = withQueryClient(() => useLocations(null));
    await vi.waitFor(() => expect(query.data.value?.map((l) => l.id)).toEqual(["root"]));
    unmount();
  });
});

describe("useLocation", () => {
  it("reads one place by id, and treats a missing place as an error rather than an empty place", async () => {
    fake.seed("locations", [place({ id: "tower" }), place({ id: "keep" })]);
    const found = withQueryClient(() => useLocation("tower"));
    await vi.waitFor(() => expect(found.result.data.value?.id).toBe("tower"));
    found.unmount();

    const missing = withQueryClient(() => useLocation("gone"));
    await vi.waitFor(() => expect(missing.result.isError.value).toBe(true));
    missing.unmount();
  });

  it("sends nothing while no place is selected", async () => {
    const { unmount } = withQueryClient(() => useLocation(null));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    unmount();
  });
});

describe("map layer writes", () => {
  const calibration = { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 };

  it("a plain picture upload sets map_url and leaves the calibration and the drawing untouched", async () => {
    fake.seed("locations", [place({ id: "site", grid_calibration: calibration, map_layer_url: "layer.png", source_map_id: "m1" })]);
    const { result, unmount } = withQueryClient(() => useUpdateLocationPicture());
    await result.mutateAsync({ id: "site", mapUrl: "scan.png" });
    expect(fake.rows("locations")[0]).toMatchObject({ map_url: "scan.png", grid_calibration: calibration, map_layer_url: "layer.png", source_map_id: "m1" });
    unmount();
  });

  it("a picture saved with a calibration writes it, and an explicit null clears it", async () => {
    fake.seed("locations", [place({ id: "site", grid_calibration: calibration })]);
    const { result, unmount } = withQueryClient(() => useUpdateLocationPicture());
    await result.mutateAsync({ id: "site", mapUrl: "scan.png", calibration: null });
    expect(fake.rows("locations")[0]).toMatchObject({ map_url: "scan.png", grid_calibration: null });
    unmount();
  });

  it("saving a styled render as the picture unlinks the drawing in the same write, keeping the drawing's own map row", async () => {
    fake.seed("locations", [place({ id: "site", map_layer_url: "layer.png", map_layer_stand_url: "stand.png", source_map_id: "m1", map_published_rev: 4 })]);
    fake.seed("dungeon_maps", [{ id: "m1" }]);
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    await result.mutateAsync({ id: "site", mapUrl: "styled.png", calibration });
    expect(fake.rows("locations")[0]).toMatchObject({
      map_url: "styled.png",
      grid_calibration: calibration,
      map_layer_url: null,
      map_layer_stand_url: null,
      source_map_id: null,
      map_published_rev: null,
    });
    expect(fake.rows("dungeon_maps")).toHaveLength(1);
    unmount();
  });

  it("an update changes one place only and queues its embedding", async () => {
    fake.seed("locations", [place({ id: "a", name: "Old" }), place({ id: "b", name: "Other" })]);
    const { result, unmount } = withQueryClient(() => useUpdateLocation());
    await result.mutateAsync({ id: "a", update: { name: "New" } });
    expect(fake.rows("locations").map((l) => l.name)).toEqual(["New", "Other"]);
    expect(mocks.invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "single", entity: "location", id: "a" } });
    unmount();
  });
});

describe("useDeleteLocation", () => {
  const files = { image_url: "i.png", map_url: "m.png", map_layer_url: "l.png", map_layer_stand_url: "s.png", map_layer_stand_live_url: null };

  beforeEach(() => {
    fake.seed("locations", [place({ id: "tower", ...files }), place({ id: "keep" })]);
    fake.seed("quest_refs", [
      { id: "r1", ref_type: "location", ref_id: "tower" },
      { id: "r2", ref_type: "location", ref_id: "keep" },
      { id: "r3", ref_type: "npc", ref_id: "tower" },
    ]);
  });

  it("deletes the place, its quest references (and only those) and the files nothing else uses", async () => {
    const { result, unmount } = withQueryClient(() => useDeleteLocation());
    await result.mutateAsync("tower");
    expect(fake.rows("locations").map((l) => l.id)).toEqual(["keep"]);
    expect(fake.rows("quest_refs").map((r) => r.id)).toEqual(["r2", "r3"]);
    expect(mocks.deleteUnreferenced).toHaveBeenCalledWith({ urls: ["i.png", "m.png", "l.png", "s.png", null] });
    unmount();
  });

  it("keeps the references and the files when the delete itself fails, so a failed delete destroys nothing", async () => {
    fake.failNext("locations", { message: "boom" }, { after: 1 });
    const { result, unmount } = withQueryClient(() => useDeleteLocation());
    await expect(result.mutateAsync("tower")).rejects.toMatchObject({ message: "boom" });
    expect(fake.rows("locations")).toHaveLength(2);
    expect(fake.rows("quest_refs")).toHaveLength(3);
    expect(mocks.deleteUnreferenced).not.toHaveBeenCalled();
    unmount();
  });

  it("deletes nothing when the place cannot even be read first", async () => {
    fake.failNext("locations", { message: "boom" });
    const { result, unmount } = withQueryClient(() => useDeleteLocation());
    await expect(result.mutateAsync("tower")).rejects.toMatchObject({ message: "boom" });
    expect(fake.rows("locations")).toHaveLength(2);
    unmount();
  });

  it("deleting a place that is already gone is a no-op, not an error", async () => {
    const { result, unmount } = withQueryClient(() => useDeleteLocation());
    await expect(result.mutateAsync("never-existed")).resolves.toBeUndefined();
    expect(mocks.deleteUnreferenced).not.toHaveBeenCalled();
    unmount();
  });
});

describe("insertSettingLocations", () => {
  const preset = (name: string, parent?: string): LocationPreset => ({ name, location_type: "city", notes: null, tags: [], ...(parent ? { parent } : {}) });

  it("adds the new places, parented through each other, level by level, and skips what the campaign already has", async () => {
    fake.seed("locations", [place({ id: "existing-realm", name: "Realm" })]);
    const added = await insertSettingLocations(
      "campaign-1",
      [preset("Realm"), preset("Harbor", "Realm"), preset("Docks", "Harbor")],
      "faerun",
    );
    expect(added).toBe(2);
    const rows = fake.rows("locations");
    const harbor = rows.find((r) => r.name === "Harbor");
    const docks = rows.find((r) => r.name === "Docks");
    expect(harbor).toMatchObject({ parent_id: "existing-realm", campaign_id: "campaign-1", user_id: "user-1", setting_source: "faerun" });
    expect(docks?.parent_id).toBe(harbor?.id);
    expect(rows.filter((r) => r.name === "Realm")).toHaveLength(1);
  });

  it("stamps the setting on the places the campaign already holds, so they stop counting against the cap", async () => {
    fake.seed("locations", [place({ id: "existing-realm", name: "Realm" })]);
    await insertSettingLocations("campaign-1", [preset("Realm")], "faerun");
    expect(mocks.stamp).toHaveBeenCalledWith("locations", ["existing-realm"], "faerun");
  });

  it("answers zero and writes nothing when every preset is already there", async () => {
    fake.seed("locations", [place({ id: "r", name: "realm" })]);
    expect(await insertSettingLocations("campaign-1", [preset("Realm")], "faerun")).toBe(0);
    expect(fake.rows("locations")).toHaveLength(1);
  });

  it("refuses presets that parent each other in a loop", async () => {
    await expect(
      insertSettingLocations("campaign-1", [preset("A", "B"), preset("B", "A")], "faerun"),
    ).rejects.toThrow(/cycle/);
  });
});
