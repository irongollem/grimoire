import { describe, it, expect } from "vitest";
import {
  drawGridPass,
  drawPenOverlay,
  drawPersistedRingOutline,
  drawSpacesPass,
  drawTemplatePreview,
  drawWaysPass,
  drawZonesPass,
  regionFillColor,
  type RenderGeometry,
} from "./planCanvas";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

// A minimal, call-recording stand-in for CanvasRenderingContext2D — every
// draw pass in this module is `(ctx, geometry, data) => void` with no other
// side channel, so recording exactly the calls a real 2D context would see
// is enough to assert what each pass drew without a real canvas (absent in
// the test DOM, same reason `canAnimate` exists for Web Animations).
function createRecordingCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const ctx = {} as CanvasRenderingContext2D;

  const round = (v: unknown): unknown => (typeof v === "number" ? Math.round(v * 100) / 100 : v);

  for (const prop of ["fillStyle", "strokeStyle", "lineWidth", "lineCap", "font", "textAlign", "textBaseline"] as const) {
    let value: unknown;
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (v: unknown) => {
        value = v;
        calls.push(`${prop}=${v}`);
      },
    });
  }

  for (const method of ["fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "closePath", "stroke", "fill", "setLineDash", "fillText"] as const) {
    (ctx as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) => {
      calls.push(`${method}(${args.map(round).join(",")})`);
    };
  }

  return { ctx, calls };
}

const CALIBRATION: GridCalibration = {
  cells_per_image_width: 4,
  origin_x_pct: 0,
  origin_y_pct: 0,
  origin_cell_x: 0,
  origin_cell_y: 0,
};

const GEOMETRY: RenderGeometry = {
  calibration: CALIBRATION,
  imageWidth: 100,
  imageHeight: 100,
  canvasWidth: 400,
  canvasHeight: 400,
};

function makeRegion(overrides: Partial<LocationMapRegion>): LocationMapRegion {
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
    derived_from: "floodfill",
    cell_signature: null,
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const identityPointToCanvas = (p: readonly [number, number]): { x: number; y: number } => ({ x: p[0], y: p[1] });

describe("drawGridPass", () => {
  it("draws a full grid for a valid calibration", () => {
    const { ctx, calls } = createRecordingCtx();
    drawGridPass(ctx, GEOMETRY);
    // cells_per_image_width=4 on a square image → 4 cols, 4 rows → 5 vertical + 5 horizontal lines.
    expect(calls.filter((c) => c.startsWith("moveTo"))).toHaveLength(10);
    expect(calls.filter((c) => c.startsWith("lineTo"))).toHaveLength(10);
    expect(calls).toContain("stroke()");
  });

  it("draws nothing for a degenerate calibration", () => {
    const { ctx, calls } = createRecordingCtx();
    drawGridPass(ctx, { ...GEOMETRY, calibration: { ...CALIBRATION, cells_per_image_width: 0 } });
    expect(calls).toHaveLength(0);
  });
});

describe("regionFillColor", () => {
  it("reads bound/unbound/active in browse mode", () => {
    const opts = { mode: "browse" as const, activeRegionId: "active", partyRoomId: null, reachableRoomIds: null };
    expect(regionFillColor(makeRegion({ id: "active" }), opts)).toBe("rgba(96, 165, 250, 0.45)");
    expect(regionFillColor(makeRegion({ id: "bound", space_location_id: "room-1" }), opts)).toBe("rgba(74, 222, 128, 0.28)");
    expect(regionFillColor(makeRegion({ id: "unbound" }), opts)).toBe("rgba(251, 191, 36, 0.28)");
  });

  it("never confuses null-party with an untraced region in run mode", () => {
    const opts = { mode: "run" as const, activeRegionId: null, partyRoomId: null, reachableRoomIds: null };
    // Both `partyRoomId` and an unbound region's `space_location_id` are null —
    // that must read as "not the party", not as a match.
    expect(regionFillColor(makeRegion({ space_location_id: null }), opts)).toBe("rgba(255, 255, 255, 0.04)");
  });

  it("shades a bound space by its room facts in browse mode (#868 frame 01)", () => {
    const opts = { mode: "browse" as const, activeRegionId: null, partyRoomId: null, reachableRoomIds: null };
    const region = makeRegion({ space_location_id: "room-1" });
    expect(regionFillColor(region, { ...opts, roomState: new Map([["room-1", { explored: false, cleared: true, looted: true }]]) })).toBe(
      "rgba(167, 139, 250, 0.34)",
    );
    expect(regionFillColor(region, { ...opts, roomState: new Map([["room-1", { explored: false, cleared: true, looted: false }]]) })).toBe(
      "rgba(74, 222, 128, 0.32)",
    );
    expect(regionFillColor(region, { ...opts, roomState: new Map([["room-1", { explored: false, cleared: false, looted: true }]]) })).toBe(
      "rgba(217, 158, 44, 0.32)",
    );
    expect(regionFillColor(region, { ...opts, roomState: new Map([["room-1", { explored: true, cleared: false, looted: false }]]) })).toBe(
      "rgba(148, 163, 184, 0.28)",
    );
  });

  it("falls back to the plain bound green when the room has no facts yet", () => {
    const opts = { mode: "browse" as const, activeRegionId: null, partyRoomId: null, reachableRoomIds: null };
    const region = makeRegion({ space_location_id: "room-1" });
    expect(regionFillColor(region, opts)).toBe("rgba(74, 222, 128, 0.28)");
    expect(regionFillColor(region, { ...opts, roomState: new Map() })).toBe("rgba(74, 222, 128, 0.28)");
  });

  it("keeps the active-selection blue over any room facts", () => {
    const opts = { mode: "browse" as const, activeRegionId: "active", partyRoomId: null, reachableRoomIds: null };
    const region = makeRegion({ id: "active", space_location_id: "room-1" });
    expect(regionFillColor(region, { ...opts, roomState: new Map([["room-1", { explored: true, cleared: true, looted: true }]]) })).toBe(
      "rgba(96, 165, 250, 0.45)",
    );
  });
});

describe("drawSpacesPass", () => {
  const opts = { mode: "browse" as const, activeRegionId: null, partyRoomId: null, reachableRoomIds: null };

  it("fills every cell of a two-cell region and stops there when unhighlighted", () => {
    const { ctx, calls } = createRecordingCtx();
    const region = makeRegion({ cells: ["0,0", "1,0"] });
    drawSpacesPass(ctx, GEOMETRY, [region], opts, identityPointToCanvas);
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("strokeRect"))).toHaveLength(0);
  });

  it("strokes a highlight box per cell for the active region", () => {
    const { ctx, calls } = createRecordingCtx();
    const region = makeRegion({ id: "active", cells: ["0,0", "1,0"] });
    drawSpacesPass(ctx, GEOMETRY, [region], { ...opts, activeRegionId: "active" }, identityPointToCanvas);
    expect(calls.filter((c) => c.startsWith("strokeRect"))).toHaveLength(2);
  });

  it("draws the pen-traced polygon outline over a region with vertices", () => {
    const { ctx, calls } = createRecordingCtx();
    const region = makeRegion({
      cells: ["0,0"],
      vertices: [
        [0, 0],
        [2, 0],
        [1, 2],
      ],
    });
    drawSpacesPass(ctx, GEOMETRY, [region], opts, identityPointToCanvas);
    expect(calls).toContain("strokeStyle=rgba(74, 222, 128, 0.8)");
    expect(calls.filter((c) => c.startsWith("closePath"))).toHaveLength(1);
  });

  it("draws an in-flight stroke's cells instead of the region's own", () => {
    const { ctx, calls } = createRecordingCtx();
    const region = makeRegion({ cells: ["0,0"] });
    const overrides = new Map<string, readonly CellKey[]>([[region.id, ["0,0", "1,0", "2,0"]]]);
    drawSpacesPass(ctx, GEOMETRY, [region], opts, identityPointToCanvas, overrides);
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(3);
  });

  it("skips zone regions entirely", () => {
    const { ctx, calls } = createRecordingCtx();
    const zone = makeRegion({ region_role: "zone", zone_kind: "hazard", cells: ["0,0"] });
    drawSpacesPass(ctx, GEOMETRY, [zone], opts, identityPointToCanvas);
    expect(calls).toHaveLength(0);
  });
});

describe("drawZonesPass", () => {
  it("fills, dashes, and labels a zone", () => {
    const { ctx, calls } = createRecordingCtx();
    const zone = makeRegion({ region_role: "zone", zone_kind: "hazard", cells: ["0,0", "1,0"], label: "Ash" });
    drawZonesPass(ctx, GEOMETRY, [zone], null, 1);
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(2);
    // Dashed stroke set, then cleared.
    expect(calls.some((c) => c.startsWith("setLineDash(7,5)"))).toBe(true);
    expect(calls.some((c) => c.startsWith("setLineDash()"))).toBe(true);
    expect(calls.some((c) => c.startsWith("fillText(ASH"))).toBe(true);
  });

  it("adds the active-region highlight box on top", () => {
    const { ctx, calls } = createRecordingCtx();
    const zone = makeRegion({ id: "z1", region_role: "zone", zone_kind: "hazard", cells: ["0,0"] });
    drawZonesPass(ctx, GEOMETRY, [zone], "z1", 1);
    expect(calls).toContain("strokeStyle=rgba(96, 165, 250, 0.9)");
  });
});

describe("drawWaysPass", () => {
  it("draws a bar across a plain door's edge", () => {
    const { ctx, calls } = createRecordingCtx();
    drawWaysPass(
      ctx,
      GEOMETRY,
      [{ source_edge_key: "0,0:N", door_kind: "door", starts_locked: false, is_secret: false }],
      identityPointToCanvas,
    );
    expect(calls).toContain("strokeStyle=#e7d9bd");
    expect(calls.filter((c) => c.startsWith("moveTo"))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("lineTo"))).toHaveLength(1);
    expect(calls).toContain("stroke()");
  });

  it("prioritises secret over locked over arch in colour, and dashes only the secret bar", () => {
    const { ctx, calls } = createRecordingCtx();
    drawWaysPass(
      ctx,
      GEOMETRY,
      [{ source_edge_key: "0,0:N", door_kind: "arch", starts_locked: true, is_secret: true }],
      identityPointToCanvas,
    );
    expect(calls).toContain("strokeStyle=#a78bfa");
    expect(calls.some((c) => c.startsWith("setLineDash(") && c !== "setLineDash()")).toBe(true);
  });

  it("skips a way with no edge key", () => {
    const { ctx, calls } = createRecordingCtx();
    drawWaysPass(ctx, GEOMETRY, [{ source_edge_key: null, door_kind: "door", starts_locked: false, is_secret: false }], identityPointToCanvas);
    expect(calls).toHaveLength(0);
  });
});

describe("drawPenOverlay", () => {
  it("draws an open ring's outline, rubber-band, and nodes", () => {
    const { ctx, calls } = createRecordingCtx();
    const ring: [number, number][] = [
      [0, 0],
      [2, 0],
    ];
    drawPenOverlay(ctx, identityPointToCanvas, ring, false, [3, 0], 9, 0.4);
    expect(calls).toContain("strokeStyle=rgba(96, 165, 250, 0.9)"); // open-ring outline colour
    expect(calls.some((c) => c.startsWith("setLineDash(5,4)"))).toBe(true); // rubber-band dash
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(2); // one square node per point
  });

  it("golds the first node when the cursor is close enough to close", () => {
    const { ctx, calls } = createRecordingCtx();
    const ring: [number, number][] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    drawPenOverlay(ctx, identityPointToCanvas, ring, false, [0.1, 0.1], 9, 0.5);
    expect(calls).toContain("fillStyle=#fbbf24");
  });

  it("fills a closed ring in the persisted colour and skips the rubber-band", () => {
    const { ctx, calls } = createRecordingCtx();
    const ring: [number, number][] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    drawPenOverlay(ctx, identityPointToCanvas, ring, true, null, 9, 0.4);
    expect(calls).toContain("fillStyle=rgba(74, 222, 128, 0.28)");
    expect(calls.some((c) => c.startsWith("setLineDash(5,4)"))).toBe(false);
  });
});

describe("drawTemplatePreview", () => {
  it("draws nothing for an empty ring", () => {
    const { ctx, calls } = createRecordingCtx();
    drawTemplatePreview(ctx, identityPointToCanvas, []);
    expect(calls).toHaveLength(0);
  });

  it("fills and strokes a non-empty ring", () => {
    const { ctx, calls } = createRecordingCtx();
    drawTemplatePreview(
      ctx,
      identityPointToCanvas,
      [
        [0, 0],
        [2, 0],
        [1, 2],
      ],
    );
    expect(calls).toContain("fillStyle=rgba(167, 139, 250, 0.22)");
    expect(calls).toContain("fill()");
    expect(calls).toContain("stroke()");
  });
});

describe("drawPersistedRingOutline", () => {
  it("closes and strokes the ring in the bound-region colour", () => {
    const { ctx, calls } = createRecordingCtx();
    drawPersistedRingOutline(
      ctx,
      identityPointToCanvas,
      [
        [0, 0],
        [2, 0],
        [1, 2],
      ],
    );
    expect(calls).toContain("strokeStyle=rgba(74, 222, 128, 0.8)");
    expect(calls).toContain("closePath()");
    expect(calls).toContain("stroke()");
  });
});
