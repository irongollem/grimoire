import { CELL_HEIGHT, CELL_WIDTH, type DollAnatomy } from "@edge-shared/paperDoll/types.ts";

export const SLOT_ANCHOR_KEYS = [
  "head",
  "neck",
  "shoulders",
  "body",
  "waist",
  "hands",
  "ring",
  "clothes",
  "feet",
] as const;
export type SlotAnchorKey = (typeof SLOT_ANCHOR_KEYS)[number];

const MIN_PCT = 4;
const MAX_PCT = 96;

/** Keep an anchor percentage within the cell's 4..96 inset. */
function clamp(n: number): number {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, n));
}

/**
 * Place slot legend endpoints on the measured body, in percentages of one doll
 * cell clamped to 4..96. Head and neck follow the head center; body, waist, and
 * feet follow the crown axis. Shoulders and clothes sit left, hands and ring right.
 */
export function slotAnchors(anatomy: DollAnatomy): Record<SlotAnchorKey, { x: number; y: number }> {
  const { head, shoulders, feetY, centerX } = anatomy;
  const headCX = (head.x0 + head.x1) / 2;
  const headH = head.y1 - head.y0;
  const shoulderW = shoulders.x1 - shoulders.x0;
  const L = feetY - shoulders.y;
  const at = (x: number, y: number) => ({
    x: clamp((x / CELL_WIDTH) * 100),
    y: clamp((y / CELL_HEIGHT) * 100),
  });
  return {
    head: at(headCX, head.y0 + 0.35 * headH),
    neck: at(headCX, head.y1),
    shoulders: at(shoulders.x0, shoulders.y),
    body: at(centerX, shoulders.y + 0.18 * L),
    waist: at(centerX, shoulders.y + 0.33 * L),
    hands: at(shoulders.x1, shoulders.y + 0.42 * L),
    ring: at(shoulders.x1 - 0.12 * shoulderW, shoulders.y + 0.5 * L),
    clothes: at(shoulders.x0 + 0.1 * shoulderW, shoulders.y + 0.6 * L),
    feet: at(centerX, feetY - 30),
  };
}
