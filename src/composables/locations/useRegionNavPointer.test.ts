// Fake-event tests for the read/navigate pointer contract — the half of
// `useRegionPointer.test.ts` that covered hover/click routing before #884's
// loose end split it out. Same harness idiom: `cellAt` maps client
// coordinates straight through (identity), so a test can reason about plain
// numbers instead of a calibration.
import { describe, it, expect, vi } from "vitest";
import { useRegionNavPointer, type UseRegionNavPointerOptions } from "./useRegionNavPointer";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

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

function makeHarness(overrides: Partial<UseRegionNavPointerOptions> = {}) {
  const mode: { current: "browse" | "run" } = { current: "browse" };
  const found: { current: LocationMapRegion | null } = { current: null };

  const options: UseRegionNavPointerOptions = {
    cellAt: vi.fn((x: number, y: number) => `${x},${y}` as CellKey),
    regionAt: vi.fn(() => found.current),
    hoverRegionAt: vi.fn(() => null),
    mode: vi.fn(() => mode.current),
    onSelect: vi.fn(),
    onNavigate: vi.fn(),
    onDescend: vi.fn(),
    onMoveParty: vi.fn(),
    isReachable: vi.fn(() => true),
    isNestedSite: vi.fn(() => false),
    onHover: vi.fn(),
    ...overrides,
  };

  const pointer = useRegionNavPointer(options);
  return { options, pointer, mode, found };
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

describe("tap vs. drag", () => {
  it("resolves a plain, unmoved tap into a click", () => {
    const { pointer, options, found } = makeHarness();
    found.current = makeRegion({ id: "target", space_location_id: null });

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(up(5, 5));

    expect(options.onSelect).toHaveBeenCalledWith("target");
  });

  it("does not resolve a click once the pointer moved past the tap threshold", () => {
    const { pointer, options, found } = makeHarness();
    found.current = makeRegion({ id: "target", space_location_id: null });

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(move(50, 50)); // well past the 6px threshold
    window.dispatchEvent(up(50, 50));

    expect(options.onSelect).not.toHaveBeenCalled();
  });
});

describe("click routing", () => {
  it("does nothing when the cell resolves to no region", () => {
    const { pointer, options } = makeHarness();

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onSelect).not.toHaveBeenCalled();
    expect(options.onNavigate).not.toHaveBeenCalled();
  });

  it("selects an unbound shape in browse mode", () => {
    const { pointer, options, found } = makeHarness();
    found.current = makeRegion({ id: "target", space_location_id: null });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onSelect).toHaveBeenCalledWith("target");
  });

  it("does not select an unbound shape in run mode", () => {
    const { pointer, options, mode, found } = makeHarness();
    mode.current = "run";
    found.current = makeRegion({ id: "target", space_location_id: null });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onSelect).not.toHaveBeenCalled();
  });

  it("navigates to a bound room in browse mode", () => {
    const { pointer, options, found } = makeHarness();
    found.current = makeRegion({ space_location_id: "room-1" });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onNavigate).toHaveBeenCalledWith("room-1");
    expect(options.onDescend).not.toHaveBeenCalled();
  });

  it("descends into a bound nested site instead of navigating", () => {
    const { pointer, options, found } = makeHarness({ isNestedSite: vi.fn(() => true) });
    found.current = makeRegion({ space_location_id: "site-2" });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onDescend).toHaveBeenCalledWith("site-2");
    expect(options.onNavigate).not.toHaveBeenCalled();
  });

  it("moves the party onto a reachable room in run mode", () => {
    const { pointer, options, mode, found } = makeHarness();
    mode.current = "run";
    found.current = makeRegion({ space_location_id: "room-1" });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onMoveParty).toHaveBeenCalledWith("room-1");
    expect(options.onNavigate).not.toHaveBeenCalled();
  });

  it("navigates instead of moving the party onto an unreachable room in run mode", () => {
    const { pointer, options, mode, found } = makeHarness({ isReachable: vi.fn(() => false) });
    mode.current = "run";
    found.current = makeRegion({ space_location_id: "room-1" });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onMoveParty).not.toHaveBeenCalled();
    expect(options.onNavigate).toHaveBeenCalledWith("room-1");
  });

  it("descends instead of moving the party onto an unreachable nested site in run mode", () => {
    const { pointer, options, mode, found } = makeHarness({
      isReachable: vi.fn(() => false),
      isNestedSite: vi.fn(() => true),
    });
    mode.current = "run";
    found.current = makeRegion({ space_location_id: "site-2" });

    pointer.onPointerDown(down(1, 1));
    window.dispatchEvent(up(1, 1));

    expect(options.onMoveParty).not.toHaveBeenCalled();
    expect(options.onDescend).toHaveBeenCalledWith("site-2");
  });
});

describe("hover", () => {
  it("emits on change, suppresses a repeat, and emits null on leave", () => {
    const { pointer, options } = makeHarness();
    vi.mocked(options.hoverRegionAt).mockReturnValue(makeRegion({ id: "hovered" }));

    pointer.onPointerMove(move(0, 0));
    expect(options.onHover).toHaveBeenCalledWith("hovered");

    pointer.onPointerMove(move(0, 0)); // unchanged — no repeat emit
    expect(options.onHover).toHaveBeenCalledTimes(1);

    pointer.onPointerLeave();
    expect(options.onHover).toHaveBeenLastCalledWith(null);
  });
});
