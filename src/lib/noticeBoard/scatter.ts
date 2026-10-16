// A board's scatter: the leftover tacks and torn scraps of notices long gone, which make a board look used rather than
// freshly hung. The DM asks for it with a button once the board is arranged, so it is worked out from the space the
// pins leave at that moment and stored on the board (migration 20261016174906); a pin dragged later never reshuffles
// it. A board that is mostly empty gets the most, a crowded one next to none.
import type { NoticeScatterPiece } from "@/types/noticeBoard.types";
import { BOARD_H, BOARD_W, POSTER_SCRAPS, SCRAPS, TACKS, hash, pinSize, type PinSlot } from "./geometry";

/** Pieces on a board with nothing on it. Every other board gets this share of its empty space. */
export const FULL_SCATTER = 18;
/** Board units between two pieces' centres, so the scatter reads as scattered rather than as a pile. */
export const MIN_GAP = 120;

/** Free space is measured on a grid of cells this many units across, inside the frame. */
const CELL = 40;
/** A piece's centre keeps this far from the board's edge: the frame's rail (about 63 units) plus half a tilted scrap. */
const INSET = 140;
/** A scrap's centre stays this far from a pin's paper, so most of it shows. */
const PIN_PAD = 30;

/** mulberry32: a few lines, and enough for decoration. Seeded so a test, or a second device, gets the same board. */
function random(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

interface Cell {
  x: number;
  y: number;
}

/** The centres of the grid cells that no pin covers, in board units. Taken stubs count: their scrap is on the board. */
export function freeCells(pins: readonly PinSlot[]): { free: Cell[]; total: number } {
  const boxes = pins.map((p) => {
    const { w, h } = pinSize(p.style, p.size);
    const x = p.x * BOARD_W;
    const y = p.y * BOARD_H;
    return { x0: x - PIN_PAD, y0: y - PIN_PAD, x1: x + w + PIN_PAD, y1: y + h + PIN_PAD };
  });
  const free: Cell[] = [];
  let total = 0;
  for (let y = INSET + CELL / 2; y <= BOARD_H - INSET - CELL / 2; y += CELL) {
    for (let x = INSET + CELL / 2; x <= BOARD_W - INSET - CELL / 2; x += CELL) {
      total++;
      if (!boxes.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) free.push({ x, y });
    }
  }
  return { free, total };
}

/** How many pieces a board with these pins gets: FULL_SCATTER, in proportion to the space left. */
export function scatterCount(pins: readonly PinSlot[]): number {
  const { free, total } = freeCells(pins);
  return countFor(free.length, total);
}

const countFor = (free: number, total: number) => Math.round((FULL_SCATTER * free) / total);

const pick = <T>(rand: () => number, pool: readonly T[]): T => pool[Math.floor(rand() * pool.length)];
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * The scatter for a board with these pins. Free cells are visited in a seeded shuffle and a piece goes in each that
 * keeps MIN_GAP from the pieces before it, until the count is reached or the space runs out. About half are torn scraps
 * still held by their tack (a poster's by its nail), the rest tacks and nails left behind when a notice came down.
 */
export function scatterBoard(pins: readonly PinSlot[], seed: string): NoticeScatterPiece[] {
  const rand = random(seed);
  const { free, total } = freeCells(pins);
  const count = countFor(free.length, total);
  const order = [...free];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const pieces: NoticeScatterPiece[] = [];
  const placed: Cell[] = [];
  for (const cell of order) {
    if (pieces.length >= count) break;
    if (placed.some((p) => Math.hypot(p.x - cell.x, p.y - cell.y) < MIN_GAP)) continue;
    placed.push(cell);
    // Jitter inside the cell, so the pieces do not line up on the grid they were found on.
    const x = round((cell.x + (rand() - 0.5) * CELL) / BOARD_W, 3);
    const y = round((cell.y + (rand() - 0.5) * CELL) / BOARD_H, 3);
    if (rand() < 0.5) {
      const poster = rand() < 0.25;
      pieces.push({
        art: poster ? pick(rand, POSTER_SCRAPS) : pick(rand, SCRAPS),
        x,
        y,
        r: round((rand() * 2 - 1) * 35, 1),
        tack: poster ? "nail" : pick(rand, TACKS),
      });
    } else {
      pieces.push({ art: rand() < 0.25 ? "nail" : pick(rand, TACKS), x, y, r: round(rand() * 360, 1), tack: null });
    }
  }
  return pieces;
}
