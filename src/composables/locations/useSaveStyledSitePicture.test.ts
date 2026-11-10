import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { StyledPlay } from "@/cartographer/styledPlay";
import { emptyLayers } from "@/types/dungeonMap.types";
import { MAP_LIVE_VERSION } from "@/types/mapLive.types";

// The writes themselves (one transaction, the key reusing its map, a refused place undoing the insert) are the
// database's and are proven in supabase/tests/save_styled_site_picture.test.sql. This file holds the client to
// sending one call with the right key.
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc }, getCurrentUser: () => ({ id: "user-1" }) }));

const { useSaveStyledSitePicture } = await import("@/composables/locations/useSaveStyledSitePicture");

function withQueryClient<T>(setup: () => T): { result: T; client: QueryClient; unmount: () => void } {
  let result!: T;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return { result, client, unmount: () => wrapper.unmount() };
}

const calibration = { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 };
const makePlay = (): StyledPlay => ({
  drawing: { name: "Keep walls", layers: emptyLayers(), darkness: "dim", default_pack_id: "pack", campaign_id: "campaign-1" },
  mapLive: { version: MAP_LIVE_VERSION, darkness: "dim", groups: [], lights: [], sprites: [], walls: [{ id: "w", a: [0, 0], b: [1, 0] }], doors: [], solid: [] },
});

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { id: "site", source_map_id: "walls-1" }, error: null });
});

describe("useSaveStyledSitePicture", () => {
  it("saves the render and its walls drawing in one call", async () => {
    const play = makePlay();
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    await result.mutateAsync({ id: "site", mapUrl: "styled.png", calibration, play });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("save_styled_site_picture", expect.objectContaining({
      p_location_id: "site",
      p_map_url: "styled.png",
      p_calibration: calibration,
      p_map_live: play.mapLive,
      p_drawing: expect.objectContaining({ name: "Keep walls", darkness: "dim", campaign_id: "campaign-1", default_pack_id: "pack" }),
    }));
    unmount();
  });

  it("a second save of the same render sends the same key, so a lost answer cannot make a second map", async () => {
    const play = makePlay();
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("connection dropped") });
    await expect(result.mutateAsync({ id: "site", mapUrl: "a.png", calibration, play })).rejects.toThrow("connection dropped");
    await result.mutateAsync({ id: "site", mapUrl: "b.png", calibration, play });
    const [first, second] = mocks.rpc.mock.calls.map(([, args]) => args.p_request_id);
    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
    unmount();
  });

  it("a new render is a new save with a key of its own", async () => {
    const { result, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    await result.mutateAsync({ id: "site", mapUrl: "a.png", calibration, play: makePlay() });
    await result.mutateAsync({ id: "site", mapUrl: "b.png", calibration, play: makePlay() });
    const [first, second] = mocks.rpc.mock.calls.map(([, args]) => args.p_request_id);
    expect(second).not.toBe(first);
    unmount();
  });

  it("refreshes the Cartographer's map list, where the walls drawing now appears", async () => {
    const { result, client, unmount } = withQueryClient(() => useSaveStyledSitePicture());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await result.mutateAsync({ id: "site", mapUrl: "a.png", calibration, play: makePlay() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dungeon_maps"] });
    unmount();
  });
});
