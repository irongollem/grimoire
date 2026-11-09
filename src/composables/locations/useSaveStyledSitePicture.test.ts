import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { StyledPlay } from "@/cartographer/styledPlay";
import { emptyLayers } from "@/types/dungeonMap.types";
import { MAP_LIVE_VERSION } from "@/types/mapLive.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ createDungeonMap: vi.fn() }));

// The fake does not generate ids or revs, which the save reads back off the new walls drawing.
vi.mock("@/composables/cartographer/useDungeonMaps", () => ({ useCreateDungeonMap: () => ({ mutateAsync: mocks.createDungeonMap }) }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

const { useSaveStyledSitePicture } = await import("@/composables/locations/useSaveStyledSitePicture");

function place(over: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return { user_id: "u", campaign_id: "campaign-1", parent_id: null, name: over.id, location_type: "building", sort_order: null, ...over };
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
  mocks.createDungeonMap.mockReset().mockResolvedValue({ id: "walls-1", rev: 3 });
});

describe("useSaveStyledSitePicture", () => {
  const calibration = { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 };

  const play: StyledPlay = {
    drawing: { name: "Keep walls", layers: emptyLayers(), darkness: "dim", default_pack_id: "pack", campaign_id: "campaign-1" },
    mapLive: { version: MAP_LIVE_VERSION, darkness: "dim", groups: [], lights: [], sprites: [], walls: [{ id: "w", a: [0, 0], b: [1, 0] }], doors: [], solid: [] },
  };

  it("saving a styled render swaps the tile drawing for the walls drawing in one write, keeping the tile drawing's own row and the snapshot", async () => {
    fake.seed("locations", [place({ id: "site", map_layer_url: "layer.png", map_layer_stand_url: "stand.png", source_map_id: "m1", map_published_rev: 4, map_live: null })]);
    fake.seed("dungeon_maps", [{ id: "m1" }]);
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    await result.mutateAsync({ id: "site", mapUrl: "styled.png", calibration, play });
    expect(mocks.createDungeonMap).toHaveBeenCalledWith(play.drawing);
    expect(fake.rows("locations")[0]).toMatchObject({
      map_url: "styled.png",
      grid_calibration: calibration,
      map_layer_url: null,
      map_layer_stand_url: null,
      map_live: play.mapLive,
      source_map_id: "walls-1",
      map_published_rev: 3,
    });
    expect(fake.rows("dungeon_maps").map((r) => r.id)).toEqual(["m1"]);
    unmount();
  });

  it("a failed walls drawing insert leaves the location exactly as it was", async () => {
    fake.seed("locations", [place({ id: "site", map_url: "old.png", map_layer_url: "layer.png", source_map_id: "m1", map_published_rev: 4 })]);
    mocks.createDungeonMap.mockRejectedValue(new Error("insert failed"));
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    await expect(result.mutateAsync({ id: "site", mapUrl: "styled.png", calibration, play })).rejects.toThrow("insert failed");
    expect(fake.rows("locations")[0]).toMatchObject({ map_url: "old.png", map_layer_url: "layer.png", source_map_id: "m1", map_published_rev: 4 });
    unmount();
  });
});
