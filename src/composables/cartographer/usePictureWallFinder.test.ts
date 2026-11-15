// The wall finder's state (#1197, frame 07): what it reads, what it proposes, and the one write it makes.
// The picture's pixels come from an injected reader: the test DOM has no canvas pixels, so `readPicturePixels` itself
// (image load, canvas, getImageData) is the one piece these tests do not reach.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { emptyLayers, type DungeonMapLayers, type WallEdge } from "@/types/dungeonMap.types";
import type { TracePixels } from "@/cartographer/pictureTrace";
import type { GridCalibration } from "@/types/location.types";
import { useToast } from "@/composables/useToast";
import { PICTURE_UNREADABLE, usePictureWallFinder, type PictureReader } from "./usePictureWallFinder";

type Rgb = [number, number, number];
const PAGE: Rgb = [52, 52, 54];
const FLOOR: Rgb = [200, 150, 80];

/** `cells` squares wide, `rows` high, 8 pixels a square (the finder's own reading resolution). Rooms are boxes of floor. */
function pixelsOf(cells: number, rows: number, rooms: [number, number, number, number][]): TracePixels {
  const px = 8;
  const width = cells * px;
  const height = rows * px;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / px;
      const y = (j + 0.5) / px;
      const inRoom = rooms.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
      data.set([...(inRoom ? FLOOR : PAGE), 255], (j * width + i) * 4);
    }
  }
  return { width, height, data };
}

// Room A is 3 x 4 squares (12), room B is 3 x 3 (9): A is the larger, so it is proposal 0.
const TWO_ROOMS = pixelsOf(14, 8, [[3, 2, 6, 6], [8, 2, 11, 5]]);

const calibration = (over: Partial<GridCalibration> = {}): GridCalibration => ({
  cells_per_image_width: 14, origin_x_pct: 0, origin_y_pct: 0, ...over,
});

function setup(opts: { cal?: GridCalibration | null; pixels?: TracePixels; reader?: PictureReader } = {}) {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const reader = vi.fn<PictureReader>(opts.reader ?? (async () => opts.pixels ?? TWO_ROOMS));
  const pushCommand = vi.fn();
  const markDirty = vi.fn();
  const picture = ref<{ url: string; calibration: GridCalibration | null } | null>({
    url: "https://cdn.test/map.png",
    calibration: opts.cal === undefined ? calibration() : opts.cal,
  });
  const finder = usePictureWallFinder({
    picture: () => picture.value, layers, snapshotStr: () => JSON.stringify(layers.value), pushCommand, markDirty, reader,
  });
  return { finder, layers, reader, pushCommand, markDirty, picture };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  const { toasts, dismiss } = useToast();
  toasts.value.map((t) => t.id).forEach(dismiss);
});

describe("find", () => {
  it("reads the picture at eight pixels a square and places the proposal where the calibration lies the picture", async () => {
    // Fourteen squares across, so 14 x 8 = 112 pixels. Lined up with its top-left at cell (20 - 0.25 * 14, 10 - 0.5 * 14)
    // = (16.5, 3): room A's squares 3..6 x 2..6 land at x 19.5..22.5, y 5..9.
    const { finder, reader } = setup({ cal: calibration({ origin_x_pct: 0.25, origin_y_pct: 0.5, origin_cell_x: 20, origin_cell_y: 10 }) });
    await finder.find();
    expect(reader).toHaveBeenCalledWith("https://cdn.test/map.png", 112);
    expect(finder.active.value).toBe(true);
    const xs = finder.proposals.value[0].ring.map(([x]) => x);
    const ys = finder.proposals.value[0].ring.map(([, y]) => y);
    // The default pull-in is 0.15. The snap to whole squares reaches 0.3: x 19.65 and 22.35 are 0.35 from a line, so they
    // stay; y 5.15 and 8.85 are within 0.3 of 5 and 9, so they snap there.
    expect(Math.min(...xs)).toBeCloseTo(19.65, 1);
    expect(Math.max(...xs)).toBeCloseTo(22.35, 1);
    expect(Math.min(...ys)).toBe(5); // y 5.15 is within 0.3 of 5, so it snaps there
    expect(Math.max(...ys)).toBe(9);
  });

  it("does not open for a picture without a lined-up grid, and does not read it", async () => {
    const { finder, reader } = setup({ cal: null });
    await finder.find();
    expect(finder.active.value).toBe(false);
    expect(reader).not.toHaveBeenCalled();
  });

  it("says the picture could not be read and stays closed when the read fails", async () => {
    const { finder } = setup({ reader: async () => { throw new DOMException("tainted", "SecurityError"); } });
    await finder.find();
    expect(finder.active.value).toBe(false);
    expect(finder.busy.value).toBe(false);
    expect(useToast().toasts.value.map((t) => [t.type, t.message])).toEqual([["error", PICTURE_UNREADABLE]]);
  });

  it("opens with no proposals for a picture that fills its page, so the slip can say none were found", async () => {
    const { finder } = setup({ pixels: pixelsOf(14, 8, [[0, 0, 14, 8]]) });
    await finder.find();
    expect(finder.active.value).toBe(true);
    expect(finder.proposals.value).toEqual([]);
  });

  it("opens nothing when the DM cancels while the picture is still loading", async () => {
    let release: (p: TracePixels) => void = () => undefined;
    const { finder } = setup({ reader: () => new Promise((resolve) => { release = resolve; }) });
    const finding = finder.find();
    finder.cancel();
    release(TWO_ROOMS);
    await finding;
    expect(finder.active.value).toBe(false);
  });

  it("starts every proposal kept", async () => {
    const { finder } = setup();
    await finder.find();
    expect(finder.proposals.value.map((p) => p.kept)).toEqual([true, true]);
    expect(finder.keptCount.value).toBe(2);
  });
});

describe("options", () => {
  it("proposes again on the same pixels, once, after the debounce, and every new proposal starts kept", async () => {
    const { finder, reader } = setup();
    await finder.find();
    finder.dropAll();
    const before = finder.proposals.value;
    finder.options.tolerance = 0.4;
    await nextTick();
    vi.advanceTimersByTime(99);
    expect(finder.proposals.value).toBe(before); // still waiting
    vi.advanceTimersByTime(1);
    expect(finder.proposals.value).not.toBe(before);
    expect(finder.proposals.value.map((p) => p.kept)).toEqual([true, true]);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("asks once for a run of changes", async () => {
    const { finder } = setup();
    await finder.find();
    const before = finder.proposals.value;
    finder.options.inset = 0.3;
    await nextTick();
    vi.advanceTimersByTime(60);
    finder.options.inset = 0.4;
    await nextTick();
    vi.advanceTimersByTime(99);
    expect(finder.proposals.value).toBe(before); // the second change restarted the wait
    vi.advanceTimersByTime(1);
    expect(finder.proposals.value).not.toBe(before);
  });

  it("does not propose again after it is cancelled", async () => {
    const { finder } = setup();
    await finder.find();
    finder.options.inset = 0.3;
    await nextTick();
    finder.cancel();
    vi.advanceTimersByTime(500);
    expect(finder.proposals.value).toEqual([]);
  });
});

describe("keeping and dropping", () => {
  it("toggles one proposal, and keep all and drop all set every one", async () => {
    const { finder } = setup();
    await finder.find();
    finder.toggle(1);
    expect(finder.proposals.value.map((p) => p.kept)).toEqual([true, false]);
    expect(finder.keptCount.value).toBe(1);
    finder.dropAll();
    expect(finder.keptCount.value).toBe(0);
    finder.keepAll();
    expect(finder.keptCount.value).toBe(2);
  });
});

describe("apply", () => {
  /** Every end appears once as an `a` and once as a `b`: the walls chain round into closed rings. */
  const chainsClosed = (walls: WallEdge[]): boolean => {
    const key = (p: readonly [number, number]): string => `${p[0]},${p[1]}`;
    const starts = walls.map((w) => key(w.a)).sort();
    const ends = walls.map((w) => key(w.b)).sort();
    return JSON.stringify(starts) === JSON.stringify(ends) && new Set(starts).size === starts.length;
  };

  it("writes only the kept rings, as hidden walls that close, in one undo step, and closes the finder", async () => {
    const { finder, layers, pushCommand, markDirty } = setup();
    await finder.find();
    finder.toggle(0); // drop the larger room A; room B stays
    const written = finder.apply();
    expect(written).toBe(1);
    const walls = Object.values(layers.value.walls);
    // Room B is a plain box (squares 8..11 x 2..5): four corners, so four walls, all of them inside B.
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => [w.a, w.b].every(([x, y]) => x >= 8 && x <= 11 && y >= 2 && y <= 5))).toBe(true);
    expect(walls.every((w) => w.visible === false && w.type === "wall" && w.pack_id === "" && w.pack_version === 0)).toBe(true);
    expect(chainsClosed(walls)).toBe(true);
    expect(pushCommand).toHaveBeenCalledTimes(1);
    const [before, after] = pushCommand.mock.calls[0] as [string, string];
    expect(Object.keys((JSON.parse(before) as { walls: object }).walls)).toHaveLength(0);
    expect(Object.keys((JSON.parse(after) as { walls: object }).walls)).toHaveLength(4);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(finder.active.value).toBe(false);
  });

  it("writes both rings when both are kept", async () => {
    const { finder, layers } = setup();
    await finder.find();
    expect(finder.apply()).toBe(2);
    expect(Object.keys(layers.value.walls)).toHaveLength(8);
  });

  it("writes nothing and files no undo step when nothing is kept", async () => {
    const { finder, layers, pushCommand, markDirty } = setup();
    await finder.find();
    finder.dropAll();
    expect(finder.apply()).toBe(0);
    expect(layers.value.walls).toEqual({});
    expect(pushCommand).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("cancel closes the finder and writes nothing", async () => {
    const { finder, layers, pushCommand } = setup();
    await finder.find();
    finder.cancel();
    expect(finder.active.value).toBe(false);
    expect(layers.value.walls).toEqual({});
    expect(pushCommand).not.toHaveBeenCalled();
  });
});

describe("ringAt", () => {
  // An outer square (0..10) and one inside it (1..9), set straight onto the finder.
  const square = (lo: number, hi: number): [number, number][] => [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];
  async function withNested() {
    const s = setup();
    await s.finder.find();
    s.finder.proposals.value = [{ ring: square(0, 10), kept: true }, { ring: square(1, 9), kept: true }];
    return s.finder;
  }

  it("picks the nearer of two rings", async () => {
    const finder = await withNested();
    // (0.4, 5): 0.4 from the outer edge x = 0, 0.6 from the inner edge x = 1.
    expect(finder.ringAt([0.4, 5], 1)).toBe(0);
    // (0.6, 5): 0.6 from the outer, 0.4 from the inner.
    expect(finder.ringAt([0.6, 5], 1)).toBe(1);
  });

  it("finds nothing beyond the reach", async () => {
    const finder = await withNested();
    // The middle of the squares is 4 cells from the inner edge.
    expect(finder.ringAt([5, 5], 0.3)).toBeNull();
  });
});
