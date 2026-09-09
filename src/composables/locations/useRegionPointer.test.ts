// Fake-event tests for the gesture state machine. `useRegionPointer` is
// built to be called from a component's `<script setup>` — it registers a
// `keydown` listener via `onMounted` — but every test here drives the
// returned handlers directly, the same way `MapRegionsLayer.vue` binds them
// to the canvas, so the missing component instance (and the dev warning
// Vue prints for the no-op `onMounted` outside one) is irrelevant: nothing
// here depends on that listener ever attaching.
import { describe, it, expect, vi } from "vitest";
import { useRegionPointer, type UseRegionPointerOptions } from "./useRegionPointer";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
    user_id: "user-1",
    site_location_id: "site-1",
    space_location_id: null,
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A fake cell/grid space: `cellAt`/`gridPointAt` map client coordinates
 *  straight through (identity), so a test can reason about plain numbers
 *  instead of a calibration. */
function makeHarness(overrides: Partial<UseRegionPointerOptions> = {}) {
  const region: { current: LocationMapRegion | null } = { current: makeRegion() };
  const mode: { current: "browse" | "run" } = { current: "browse" };
  const tool: { current: "paint" | "pen" | "template" } = { current: "paint" };

  const options: UseRegionPointerOptions = {
    cellAt: vi.fn((x: number, y: number) => `${x},${y}` as CellKey),
    isPaintable: vi.fn(() => true),
    gridPointAt: vi.fn((x: number, y: number) => [x, y] as GridPoint),
    activeRegion: vi.fn(() => region.current),
    hasActiveRegionId: vi.fn(() => region.current !== null),
    tool: vi.fn(() => tool.current),
    mode: vi.fn(() => mode.current),
    regionAt: vi.fn(() => null),
    hoverRegionAt: vi.fn(() => null),
    commitCells: vi.fn(),
    commitRing: vi.fn().mockResolvedValue(undefined),
    commitTemplate: vi.fn(),
    confirmConvert: vi.fn().mockResolvedValue(true),
    onSelect: vi.fn(),
    onNavigate: vi.fn(),
    onDescend: vi.fn(),
    onMoveParty: vi.fn(),
    isReachable: vi.fn(() => true),
    isNestedSite: vi.fn(() => false),
    onHover: vi.fn(),
    ...overrides,
  };

  const pointer = useRegionPointer(options);
  return { options, pointer, region, mode, tool };
}

function down(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y, ...init });
}
function move(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointermove", { clientX: x, clientY: y, ...init });
}
function up(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerup", { clientX: x, clientY: y, ...init });
}

describe("paint stroke", () => {
  it("locks the paint direction — a cell already toggled this stroke doesn't toggle back", () => {
    const { pointer, region } = makeHarness();
    region.current = makeRegion({ cells: [] });

    pointer.onPointerDown(down(0, 0));
    expect(pointer.strokeCells.value).toEqual({ regionId: "region-1", cells: ["0,0"] });

    window.dispatchEvent(move(0, 0)); // same cell again — no re-toggle
    expect(pointer.strokeCells.value?.cells).toEqual(["0,0"]);

    window.dispatchEvent(move(1, 1)); // a new cell — added
    expect(pointer.strokeCells.value?.cells).toEqual(["0,0", "1,1"]);

    window.dispatchEvent(move(0, 0)); // back over the first cell — still locked to "paint"
    expect(pointer.strokeCells.value?.cells).toEqual(["0,0", "1,1"]);
  });

  it("commits the finished stroke on pointerup and clears the in-flight state", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] });

    pointer.onPointerDown(down(2, 2));
    window.dispatchEvent(up(2, 2));

    expect(options.commitCells).toHaveBeenCalledWith("region-1", ["2,2"]);
    expect(pointer.strokeCells.value).toBeNull();
  });
});

describe("tap vs. drag", () => {
  it("resolves a plain, unmoved tap into a click", () => {
    const { pointer, options, region } = makeHarness();
    region.current = null; // nothing active — a plain click should route
    vi.mocked(options.regionAt).mockReturnValue(makeRegion({ id: "target", space_location_id: null }));

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(up(5, 5));

    expect(options.onSelect).toHaveBeenCalledWith("target");
  });

  it("does not resolve a click once the pointer moved past the tap threshold", () => {
    const { pointer, options, region } = makeHarness();
    region.current = null;
    vi.mocked(options.regionAt).mockReturnValue(makeRegion({ id: "target", space_location_id: null }));

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(move(50, 50)); // well past the 6px threshold
    window.dispatchEvent(up(50, 50));

    expect(options.onSelect).not.toHaveBeenCalled();
  });
});

describe("pen tool", () => {
  it("closes a draft once the first node is clicked again", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    pointer.onPointerDown(down(2, 4));
    expect(pointer.draftRing.value).toEqual([
      [0, 0],
      [4, 0],
      [2, 4],
    ]);

    pointer.onPointerDown(down(0.1, 0.1)); // within snap range of the first node
    expect(options.commitRing).toHaveBeenCalledWith("region-1", [
      [0, 0],
      [4, 0],
      [2, 4],
    ]);
    expect(pointer.draftRing.value).toEqual([]); // handed off, not left behind
  });

  it("alt-click refuses to delete a persisted ring below 3 points", () => {
    const triangle: GridPoint[] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    // A persisted 3-point ring — alt-delete on it should refuse below 3.
    region.current = makeRegion({ vertices: triangle });

    pointer.onPointerDown(down(0.1, 0.1, { altKey: true }));

    expect(options.commitRing).toHaveBeenCalledWith("region-1", triangle);
  });

  it("double-click inserts a node into a persisted ring", () => {
    const triangle: GridPoint[] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: triangle });

    pointer.onDoubleClick(new MouseEvent("dblclick", { clientX: 2, clientY: 0 }));

    expect(options.commitRing).toHaveBeenCalled();
    const [, ring] = vi.mocked(options.commitRing).mock.calls[0]!;
    expect(ring).toHaveLength(4);
  });

  it("Escape abandons an unsaved draft only", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    expect(pointer.draftRing.value).toHaveLength(2);

    pointer.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(pointer.draftRing.value).toEqual([]);
  });
});

describe("template drag", () => {
  it("tracks radius while dragging and commits on release", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(move(8, 9)); // 3-4-5 triangle from the centre
    expect(pointer.templateDraft.value?.radius).toBe(5);

    window.dispatchEvent(up(8, 9));
    expect(options.commitTemplate).toHaveBeenCalledTimes(1);
    const [regionId] = vi.mocked(options.commitTemplate).mock.calls[0]!;
    expect(regionId).toBe("region-1");
  });

  it("drops a zero-radius drag without committing anything", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(up(5, 5)); // released without ever dragging

    expect(options.commitTemplate).not.toHaveBeenCalled();
  });
});

describe("async-gesture guard", () => {
  it("commits immediately when the pointerup already landed mid-confirm, instead of losing the stroke", async () => {
    let resolveConfirm!: (ok: boolean) => void;
    const { pointer, options, region } = makeHarness({
      confirmConvert: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveConfirm = resolve;
          }),
      ),
    });
    // A pen-traced region: painting it needs the vertices→cells confirm.
    region.current = makeRegion({
      vertices: [
        [0, 0],
        [4, 0],
        [2, 4],
      ],
      cells: ["9,9"],
    });

    pointer.onPointerDown(down(0, 0));
    expect(options.confirmConvert).toHaveBeenCalled();
    expect(pointer.strokeCells.value).toBeNull(); // still waiting on the confirm

    // The down/up pair completes before the confirm dialog resolves — the
    // `{ once: true }` pointerup listener is already gone by the time the
    // confirm settles, so nothing else will ever call `commitCells` for this
    // gesture unless the resuming handler notices and commits itself.
    window.dispatchEvent(up(0, 0));
    expect(options.onSelect).not.toHaveBeenCalled();
    expect(options.regionAt).not.toHaveBeenCalled();
    expect(options.commitCells).not.toHaveBeenCalled();

    resolveConfirm(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(options.commitCells).toHaveBeenCalledTimes(1);
    expect(options.commitCells).toHaveBeenCalledWith("region-1", ["9,9", "0,0"]);
    expect(pointer.strokeCells.value).toBeNull(); // committed and cleared, not left stranded
  });

  it("commits nothing when the confirm is rejected", async () => {
    let resolveConfirm!: (ok: boolean) => void;
    const { pointer, options, region } = makeHarness({
      confirmConvert: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveConfirm = resolve;
          }),
      ),
    });
    region.current = makeRegion({
      vertices: [
        [0, 0],
        [4, 0],
        [2, 4],
      ],
      cells: ["9,9"],
    });

    pointer.onPointerDown(down(0, 0));
    window.dispatchEvent(up(0, 0)); // lands mid-confirm, same as above

    resolveConfirm(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(options.commitCells).not.toHaveBeenCalled();
    expect(pointer.strokeCells.value).toBeNull();
  });

  it("an ordinary paint drag on a cell region (no confirm needed) still commits on pointerup", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] }); // vertices: null — no conversion confirm

    pointer.onPointerDown(down(3, 3));
    window.dispatchEvent(move(4, 4));
    window.dispatchEvent(up(4, 4));

    expect(options.commitCells).toHaveBeenCalledTimes(1);
    expect(options.commitCells).toHaveBeenCalledWith("region-1", ["3,3", "4,4"]);
    expect(pointer.strokeCells.value).toBeNull();
  });
});

describe("hover", () => {
  it("emits on change and suppresses while a stroke is in flight", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] });
    vi.mocked(options.hoverRegionAt).mockReturnValue(makeRegion({ id: "hovered" }));

    pointer.onPointerMove(move(0, 0));
    expect(options.onHover).toHaveBeenCalledWith("hovered");

    pointer.onPointerMove(move(0, 0)); // unchanged — no repeat emit
    expect(options.onHover).toHaveBeenCalledTimes(1);

    pointer.onPointerDown(down(1, 1)); // starts a paint stroke
    vi.mocked(options.hoverRegionAt).mockReturnValue(null);
    pointer.onPointerMove(move(2, 2));
    expect(options.onHover).toHaveBeenCalledTimes(1); // suppressed mid-stroke

    pointer.onPointerLeave();
    expect(options.onHover).toHaveBeenLastCalledWith(null);
  });
});
