// A focused regression test for `abandonGesture` (#884 review finding 2) —
// the one-line delegate to `useRegionPointer.abandonGesture` is otherwise
// invisible to any test: `useMapCanvasEditor.test.ts` mocks this whole
// module out, and `useRegionPointer.test.ts` only exercises the underlying
// gesture machinery directly, never through this module's own wiring. Built
// against a REAL `useRegionPointer` underneath (only `plan` and the
// geometry callbacks are faked), so this proves the actual production
// delegate, not a stand-in for it.
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePlanCanvasTools } from "./usePlanCanvasTools";
import { emptyLayers, type CellKey } from "@/types/dungeonMap.types";
import type { usePlanPalette } from "./usePlanPalette";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1",
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

function makeHarness() {
  const region = makeRegion();
  const commitCells = vi.fn();
  const plan = {
    regions: ref([region]),
    ways: ref([]),
    planTool: ref("space"),
    traceTool: ref("paint"),
    activeRegionId: ref("r1"),
    activeRegion: computed(() => region),
    commitCells,
    commitRing: vi.fn(async () => {}),
    commitTemplate: vi.fn(),
    confirmConvert: vi.fn(async () => true),
    claimFloorRegion: vi.fn(async () => {}),
    existingDoorAtEdge: vi.fn(() => null),
    placeDoorAt: vi.fn(),
    cycleDoorKind: vi.fn(),
    removeDoor: vi.fn(),
  } as unknown as ReturnType<typeof usePlanPalette>;

  const tools = usePlanCanvasTools({
    plan,
    layers: ref(emptyLayers()),
    // Identity mapping — a test can reason about plain coordinates.
    cellAt: (x, y) => `${x},${y}` as CellKey,
    gridPointAt: (x, y) => [x, y],
    worldPointAt: (x, y) => ({ x, y }),
    tilePixelSize: () => 32,
  });

  return { tools, plan, commitCells };
}

function down(x: number, y: number): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y });
}
function move(x: number, y: number): PointerEvent {
  return new PointerEvent("pointermove", { clientX: x, clientY: y });
}
function up(x: number, y: number): PointerEvent {
  return new PointerEvent("pointerup", { clientX: x, clientY: y });
}

describe("usePlanCanvasTools.abandonGesture (#884 review finding 2)", () => {
  it("abandons an in-flight Space paint stroke so the stray pointerup does not commit it", () => {
    const { tools, commitCells } = makeHarness();

    tools.onPointerDown(down(0, 0));
    tools.onPointerMove(move(1, 1));

    tools.abandonGesture();

    // The window listener useRegionPointer attached is gone — this pointerup
    // is exactly the one the DM releases after switching layers.
    window.dispatchEvent(up(1, 1));

    expect(commitCells).not.toHaveBeenCalled();
  });

  it("is a harmless no-op when nothing is in flight (e.g. the Door/Claim tools, which have no gesture to abandon)", () => {
    const { tools } = makeHarness();
    expect(() => tools.abandonGesture()).not.toThrow();
  });
});
