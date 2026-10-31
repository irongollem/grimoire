import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  store: vi.fn(),
  upload: vi.fn(),
  removeFile: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  deleteLocal: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/mapImport/storePicture", () => ({ storePicture: (...a: unknown[]) => m.store(...a) }));
vi.mock("@/lib/mapImport/localMedia", () => ({ deleteLocalMap: (...a: unknown[]) => m.deleteLocal(...a) }));
vi.mock("@/composables/useImageUpload", () => ({ useImageUpload: () => ({ upload: m.upload, remove: m.removeFile }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutateAsync: m.update }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: m.info, error: m.error, fromError: String }) }));

import { usePlacePicture } from "./usePlacePicture";

const place = { id: "p1", map_url: "https://cdn/old.webp", map_motion: null, is_battle_map: false };
const file = new File(["x"], "map.png");

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.store.mockResolvedValue({ mapUrl: "https://cdn/new.webp", motion: null, couldNotKeepMoving: false });
  m.update.mockResolvedValue({});
  m.confirm.mockResolvedValue(true);
});

describe("usePlacePicture", () => {
  it("replaces a picture: writes the new still, then removes the old one from the store", async () => {
    const pic = usePlacePicture(place);
    await pic.setPicture(file);
    expect(m.update).toHaveBeenCalledWith({ id: "p1", update: { map_url: "https://cdn/new.webp", map_motion: null } });
    expect(m.removeFile).toHaveBeenCalledWith("https://cdn/old.webp");
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.removeFile.mock.invocationCallOrder[0]!);
  });

  it("keeps the calibration when a picture is replaced: a sharper scan of the same map keeps its grid", async () => {
    await usePlacePicture(place).setPicture(file);
    expect(m.update.mock.calls[0]![0].update).not.toHaveProperty("grid_calibration");
  });

  it("records the motion of a moving map and leaves its local file alone", async () => {
    const motion = { kind: "video", file_name: "a.webm", mime: "video/webm", bytes: 9, width: 10, height: 10 };
    m.store.mockResolvedValue({ mapUrl: "https://cdn/still.webp", motion, couldNotKeepMoving: false });
    await usePlacePicture(place).setPicture(file);
    expect(m.update.mock.calls[0]![0].update.map_motion).toEqual(motion);
    expect(m.deleteLocal).not.toHaveBeenCalled();
  });

  it("forgets the old moving file when the new picture is a still", async () => {
    await usePlacePicture(place).setPicture(file);
    expect(m.deleteLocal).toHaveBeenCalledWith("p1");
  });

  it("tells the DM when the browser could not keep a moving map", async () => {
    m.store.mockResolvedValue({ mapUrl: "u", motion: null, couldNotKeepMoving: true });
    await usePlacePicture(place).setPicture(file);
    expect(m.info).toHaveBeenCalledTimes(1);
  });

  it("says why when the upload fails, and writes nothing", async () => {
    m.store.mockRejectedValue(new Error("no space"));
    const pic = usePlacePicture(place);
    await pic.setPicture(file);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.error).toHaveBeenCalledTimes(1);
    expect(pic.busy.value).toBe(false);
  });

  it("removes a picture with its grid and its moving file, after the DM confirms", async () => {
    await usePlacePicture(place).removePicture();
    expect(m.update).toHaveBeenCalledWith({ id: "p1", update: { map_url: null, grid_calibration: null, map_motion: null } });
    expect(m.removeFile).toHaveBeenCalledWith("https://cdn/old.webp");
    expect(m.deleteLocal).toHaveBeenCalledWith("p1");
  });

  it("keeps the picture when the DM backs out of removing it", async () => {
    m.confirm.mockResolvedValue(false);
    await usePlacePicture(place).removePicture();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.removeFile).not.toHaveBeenCalled();
  });

  it("writes a calibration and the battle-map flag to the place", async () => {
    const pic = usePlacePicture(place);
    const cal = { cells_per_image_width: 30, origin_x_pct: 0.01, origin_y_pct: 0 };
    await pic.setCalibration(cal);
    await pic.setBattleMap(true);
    expect(m.update).toHaveBeenNthCalledWith(1, { id: "p1", update: { grid_calibration: cal } });
    expect(m.update).toHaveBeenNthCalledWith(2, { id: "p1", update: { is_battle_map: true } });
  });

  it("ignores a second request while one is still being written, so a double click cannot upload twice", async () => {
    let finish!: () => void;
    m.store.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ mapUrl: "u", motion: null, couldNotKeepMoving: false }); }));
    const pic = usePlacePicture(place);
    const first = pic.setPicture(file);
    await pic.setPicture(file);
    finish();
    await first;
    expect(m.store).toHaveBeenCalledTimes(1);
  });
});
