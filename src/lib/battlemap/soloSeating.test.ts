import { describe, expect, it } from "vitest";
import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";
import { soloSeating } from "./soloSeating";

function who(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: null, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}
const pc = (id: string, over: Partial<RunCombatant> = {}) => who(id, { type: "player", ...over });
function room(w: number, h: number, x0 = 0, y0 = 0): CellKey[] {
  const out: CellKey[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(cellKey(x0 + x, y0 + y));
  return out;
}
const key = (p: { x: number; y: number } | undefined) => (p ? `${p.x},${p.y}` : "none");
const key2 = (p: { x: number; y: number } | undefined) => (p ? cellKey(p.x, p.y) : "none");

describe("soloSeating", () => {
  // Bug caught: a solo player arriving at a fight with everyone still in the tray, as on the DM's own screen.
  it("puts the party and the foes on a bare picture, each side on its own half and on the map", () => {
    const out = soloSeating([pc("rosie"), who("hound1"), who("hound2"), who("hound3")], { focusCells: [], grid: { cols: 30, rows: 20 } });
    expect(out.size).toBe(4);
    const rosie = out.get("rosie")!;
    const hounds = ["hound1", "hound2", "hound3"].map((id) => out.get(id)!);
    // The party stands below the middle row (10), the foes above it.
    expect(rosie.y).toBeGreaterThan(10);
    for (const h of hounds) expect(h.y).toBeLessThan(10);
    for (const p of out.values()) expect(p.x >= 0 && p.x < 30 && p.y >= 0 && p.y < 20).toBe(true);
  });

  // Bug caught: the fight opening with a foe already next to the player, so the first turn is no choice at all.
  it("opens with the sides a move apart on a bare picture", () => {
    const out = soloSeating([pc("rosie"), who("hound")], { focusCells: [], grid: { cols: 30, rows: 20 } });
    const gap = out.get("rosie")!.y - out.get("hound")!.y;
    // 30 feet is six squares; anything from five to eight is a round's walk away without being across the map.
    expect(gap).toBeGreaterThanOrEqual(5);
    expect(gap).toBeLessThanOrEqual(8);
  });

  it("stacks nobody on anybody", () => {
    const out = soloSeating([pc("a"), pc("b"), who("c"), who("d"), who("e")], { focusCells: [], grid: { cols: 30, rows: 20 } });
    expect(new Set([...out.values()].map(key)).size).toBe(5);
  });

  // Bug caught: a traced room ignored, and the fight set in the middle of the whole site's picture instead.
  it("keeps everyone inside the fight's own room when the map has one", () => {
    const cells = room(4, 3, 10, 10);
    const out = soloSeating([pc("rosie"), who("hound1"), who("hound2")], { focusCells: cells, grid: { cols: 40, rows: 40 } });
    expect(out.size).toBe(3);
    for (const p of out.values()) expect(cells).toContain(cellKey(p.x, p.y));
  });

  // Bug caught: a token the player had already moved being thrown back to its starting square on a reload.
  it("leaves whoever already has a square where they are", () => {
    const out = soloSeating([pc("rosie", { position: { x: 3, y: 3 } }), who("hound")], { focusCells: [], grid: { cols: 30, rows: 20 } });
    expect(out.has("rosie")).toBe(false);
    expect(out.has("hound")).toBe(true);
  });

  // Bug caught live (17 Nov 2026): Sift stood in the black beside the building, farthest from the player.
  it("stands everyone on ground the picture shows, the foe a walk away and reachable", () => {
    // A corridor two squares wide down the left of a 7 by 12 picture; everything else is black.
    const floor = new Set(room(2, 12));
    const out = soloSeating([pc("rosie"), who("sift")], { focusCells: [], grid: { cols: 7, rows: 12 }, floor });
    const rosie = out.get("rosie")!;
    const sift = out.get("sift")!;
    expect(floor.has(cellKey(rosie.x, rosie.y))).toBe(true);
    expect(floor.has(cellKey(sift.x, sift.y))).toBe(true);
    // Six steps over ground: 30 feet.
    expect(Math.abs(sift.x - rosie.x) + Math.abs(sift.y - rosie.y)).toBe(6);
  });

  // Bug caught: a foe put on a lit square the party cannot walk to (another room with no way through the black).
  it("keeps the foes in the space the party stands in", () => {
    // Two islands of ground: the party's (nearest the middle) and one across a gap.
    const here = room(3, 3, 3, 4);
    const there = room(2, 2, 8, 0);
    const out = soloSeating([pc("rosie"), who("a"), who("b")], { focusCells: [], grid: { cols: 10, rows: 10 }, floor: new Set([...here, ...there]) });
    for (const id of ["rosie", "a", "b"]) expect(here).toContain(key2(out.get(id)));
  });

  it("places nobody before the picture's grid is known", () => {
    expect(soloSeating([pc("rosie"), who("hound")], { focusCells: [], grid: null }).size).toBe(0);
  });

  // Bug caught: a picture only a few squares tall seating nobody, because a block fell wholly off its edge.
  it("still seats both sides on a picture too small for two blocks", () => {
    const out = soloSeating([pc("rosie"), who("hound")], { focusCells: [], grid: { cols: 3, rows: 2 } });
    expect(out.size).toBe(2);
  });
});
