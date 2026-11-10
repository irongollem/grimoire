import { describe, expect, it } from "vitest";
import { dressingCellBounds, type DressingCatalog, type DressingProp } from "@/cartographer/dressing";
import {
  buildInnLayers,
  COMMON,
  INN_DOORS,
  INN_PROP_FOOTPRINTS,
  INN_ROOMS,
  KITCHEN,
  PARLOUR,
  PORCH,
  SNUG,
  STOREROOM,
  YARD,
} from "./demo-inn-map.ts";
import type { Rect } from "./map-layers-kit.ts";

const ROOM_RECTS: Record<string, Rect> = {
  "The Porch": PORCH,
  "The Common Room": COMMON,
  "The Kitchen": KITCHEN,
  "Floss's Parlour": PARLOUR,
  "The Snug": SNUG,
  "The Storeroom": STOREROOM,
  "The Back Yard": YARD,
};

const roomAt = (x: number, y: number): string | undefined =>
  Object.entries(ROOM_RECTS).find(([, r]) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)?.[0];

const catalog: DressingCatalog = new Map(
  Object.entries(INN_PROP_FOOTPRINTS).map(([id, [w, h]]): [string, DressingProp] => [
    id,
    { id, name: id, footprint_w: w, footprint_h: h, image: null, flat: false, light: null, url: null, sway: null },
  ]),
);

function footprints() {
  return Object.values(buildInnLayers().dressing).map((p) => {
    const b = dressingCellBounds(p, catalog);
    const cells: [number, number][] = [];
    for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) cells.push([x, y]);
    return { id: p.prop_id, cells };
  });
}

describe("the inn's doors", () => {
  it("each INN_DOORS edge is a closed door that really joins the two rooms it names", () => {
    // Fails if a door edge is edited off the wall line it should cut, or points into a room it does not join.
    const { walls } = buildInnLayers();
    for (const door of INN_DOORS) {
      expect(walls[door.edge]?.type, door.edge).toBe("doorClosed");
      const [cell, side] = door.edge.split(":");
      const [x, y] = cell.split(",").map(Number);
      const here = roomAt(x, y);
      const beyond = side === "N" ? roomAt(x, y - 1) : roomAt(x - 1, y);
      expect([here, beyond].sort(), door.edge).toEqual([...door.between].sort());
    }
  });
});

describe("the inn's furniture", () => {
  it("no two props share a cell and none stands on a floor-less cell", () => {
    // Fails if a prop is moved onto another one, or off the room it was placed in.
    const taken = new Map<string, string>();
    for (const { id, cells } of footprints()) {
      for (const [x, y] of cells) {
        expect(roomAt(x, y), `${id} at ${x},${y} is outside every room`).toBeDefined();
        const key = `${x},${y}`;
        expect(taken.get(key), `${id} overlaps ${taken.get(key)} at ${key}`).toBeUndefined();
        taken.set(key, id);
      }
    }
  });

  it("nothing blocks the cell on either side of a door", () => {
    // Fails if a prop is dropped in a doorway so the party cannot walk through it.
    const covered = new Set(footprints().flatMap(({ cells }) => cells.map(([x, y]) => `${x},${y}`)));
    const { object } = buildInnLayers();
    for (const door of INN_DOORS) {
      const [cell, side] = door.edge.split(":");
      const [x, y] = cell.split(",").map(Number);
      const sides = side === "N" ? [`${x},${y}`, `${x},${y - 1}`] : [`${x},${y}`, `${x - 1},${y}`];
      for (const s of sides) {
        expect(covered.has(s), `${s} beside ${door.edge}`).toBe(false);
        expect(object[s as keyof typeof object], `${s} beside ${door.edge}`).toBeUndefined();
      }
    }
  });

  it("every named room has an annotation inside its own floor", () => {
    // Fails if a room's name cell drifts into another room, so publish would name the wrong space.
    for (const room of INN_ROOMS) {
      const [x, y] = room.cell.split(",").map(Number);
      expect(roomAt(x, y), room.name).toBe(room.name);
    }
  });
});

describe("the inn's chairs", () => {
  /** A chair's art has its back at the top: at rotation 0 it faces south, and rotation turns it clockwise. */
  const FACING: Record<number, [number, number]> = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] };
  const SEATS_AT = new Set(["dressing_bar_counter", "dressing_palace_feast_table", "dressing_home_dining_set", "dressing_desk"]);

  it("every chair faces the table or counter beside it, so the styler is not handed one sitting with its back to it", () => {
    // Fails on the bug the maintainer found (9 Nov 2026): the bar stools and the feast table's end chairs were
    // drawn facing away, and the AI styler painted them exactly so.
    const occupied = new Map<string, string>();
    for (const { id, cells } of footprints()) for (const [x, y] of cells) occupied.set(`${x},${y}`, id);
    const chairs = Object.values(buildInnLayers().dressing).filter((p) => p.prop_id === "dressing_chair");
    expect(chairs.length).toBeGreaterThan(0);
    for (const chair of chairs) {
      const [dx, dy] = FACING[((chair.rotation % 360) + 360) % 360];
      const faced = occupied.get(`${chair.x + dx},${chair.y + dy}`);
      expect(faced !== undefined && SEATS_AT.has(faced), `chair at ${chair.x},${chair.y} faces ${faced}`).toBe(true);
    }
  });
});
