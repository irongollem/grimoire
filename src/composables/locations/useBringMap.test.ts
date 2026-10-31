import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UniversalVttMap } from "@/lib/mapImport/universalVtt";

const m = vi.hoisted(() => ({
  store: vi.fn(),
  deleteLocal: vi.fn(),
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
  createMap: vi.fn(),
}));

vi.mock("@/lib/mapImport/storePicture", () => ({ storePicture: (...a: unknown[]) => m.store(...a) }));
vi.mock("@/lib/mapImport/localMedia", () => ({ deleteLocalMap: (...a: unknown[]) => m.deleteLocal(...a) }));
vi.mock("@/composables/useImageUpload", () => ({ useImageUpload: () => ({ upload: vi.fn(), remove: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp1" }) }));
vi.mock("@/composables/cartographer/useDungeonMaps", () => ({ useCreateDungeonMap: () => ({ mutateAsync: m.createMap }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useCreateLocation: () => ({ mutateAsync: m.createLocation }),
  useUpdateLocation: () => ({ mutateAsync: m.updateLocation }),
}));

import { useBringMap } from "./useBringMap";

const cal = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 };
const file = new File(["x"], "ambush.webp", { type: "image/webp" });

const vttMap: UniversalVttMap = {
  image: new Blob(["png"], { type: "image/png" }),
  cols: 30,
  rows: 20,
  pixelsPerGrid: 100,
  walls: [{ a: [1, 1], b: [2, 1] }],
  doors: [{ a: [3, 3], b: [4, 3], open: false }],
  lights: [{ x: 5, y: 5, rangeCells: 4, intensity: 1, color: "#ffffff" }],
};

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.store.mockResolvedValue({ mapUrl: "https://cdn/still.webp", motion: null, couldNotKeepMoving: false });
  m.createLocation.mockResolvedValue({ id: "newplace" });
  m.createMap.mockResolvedValue({ id: "dm1", rev: 4 });
});

describe("useBringMap", () => {
  it("makes a new battlefield, marked as a battle map, and puts the picture on it with the lined-up grid", async () => {
    const out = await useBringMap().addMap({ file, name: "Ambush", calibration: cal, target: { kind: "new" }, posterAt: 0 });
    expect(m.createLocation.mock.calls[0]![0]).toMatchObject({ name: "Ambush", is_battle_map: true, parent_id: null, campaign_id: "camp1" });
    expect(m.store.mock.calls[0]![1]).toBe("newplace"); // a moving map is kept under the place's id
    expect(m.updateLocation).toHaveBeenCalledWith({
      id: "newplace",
      update: { map_url: "https://cdn/still.webp", map_motion: null, grid_calibration: cal },
    });
    expect(out.placeId).toBe("newplace");
  });

  it("puts the picture on the place the DM picked without creating one, and leaves its battle-map flag alone", async () => {
    await useBringMap().addMap({ file, name: "Ambush", calibration: cal, target: { kind: "existing", id: "town1" }, posterAt: 0 });
    expect(m.createLocation).not.toHaveBeenCalled();
    expect(m.updateLocation.mock.calls[0]![0].id).toBe("town1");
    expect(m.updateLocation.mock.calls[0]![0].update).not.toHaveProperty("is_battle_map");
  });

  it("forgets the old moving file of a place that now has a still", async () => {
    await useBringMap().addMap({ file, name: "A", calibration: cal, target: { kind: "existing", id: "town1" }, posterAt: 0 });
    expect(m.deleteLocal).toHaveBeenCalledWith("town1");
  });

  it("keeps the moving file of a place that now has a moving map", async () => {
    m.store.mockResolvedValue({ mapUrl: "u", motion: { kind: "video" }, couldNotKeepMoving: false });
    await useBringMap().addMap({ file, name: "A", calibration: cal, target: { kind: "existing", id: "town1" }, posterAt: 0 });
    expect(m.deleteLocal).not.toHaveBeenCalled();
  });

  it("takes the still from the frame the DM chose", async () => {
    await useBringMap().addMap({ file, name: "A", calibration: cal, target: { kind: "new" }, posterAt: 6.5 });
    expect(m.store.mock.calls[0]![3]).toBe(6.5);
  });

  describe("a Universal VTT file", () => {
    const vtt = { map: vttMap, natural: { width: 3000, height: 2000 }, defaultPackId: null };
    const bring = () => useBringMap().addMap({ file, name: "Keep", calibration: { ...cal, cells_per_image_width: 12 }, target: { kind: "new" }, posterAt: 0, vtt });

    it("uses the file's own picture, not the file", async () => {
      await bring();
      const stored = m.store.mock.calls[0]![0] as File;
      expect(stored).not.toBe(file);
      expect(stored.type).toBe("image/png");
    });

    it("makes a Drawing of its walls, doors and lights named for the map and links it to the place", async () => {
      await bring();
      const created = m.createMap.mock.calls[0]![0];
      expect(created.name).toBe("Keep");
      expect(Object.keys(created.layers.walls)).toHaveLength(2); // one wall, one door
      expect(Object.keys(created.layers.lights)).toHaveLength(1);
      const update = m.updateLocation.mock.calls[0]![0].update;
      expect(update.source_map_id).toBe("dm1");
    });

    it("writes the live snapshot at once, so the battle map has sight and light without a bake", async () => {
      await bring();
      const update = m.updateLocation.mock.calls[0]![0].update;
      expect(update.map_live).toMatchObject({ version: 3 });
      expect(update.map_live.walls).toHaveLength(1);
      expect(update.map_live.doors).toHaveLength(1);
      expect(update.map_live.lights).toHaveLength(1);
    });

    it("brings a map when no tile set is published: the Drawing simply opens without one (#1125)", async () => {
      await bring();
      expect(m.createMap.mock.calls[0]![0].default_pack_id).toBeNull();
    });

    it("takes the grid from the file, whatever the DM's own was", async () => {
      await bring();
      expect(m.updateLocation.mock.calls[0]![0].update.grid_calibration.cells_per_image_width).toBe(30);
    });

    it("marks the site as published at the Drawing's revision, since the snapshot came from it", async () => {
      await bring();
      expect(m.updateLocation.mock.calls[0]![0].update.map_published_rev).toBe(4);
    });
  });
});
