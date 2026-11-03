// The phone battle map's move maths (#1125 decision 14): where a tap lands, what the move costs against the
// character's speed, who is up before them, and how to pan so a token sits in the middle. Pure; the view wires it.
// A player's counter warns and never refuses ("the DM is never blocked"), so nothing here says no.

import {
  moveLabel,
  OPEN_GROUND,
  planMove,
  snapAnchor,
  speedState,
  stepStates,
  type Cell,
  type MovePlan,
  type SpeedState,
} from "@/lib/battlemap/movement";
import type { PathLine } from "@/components/encounters/play/PlayMovePath.vue";
import type { RunCombatant } from "@/types/encounter.types";

/** The grid square (fractional, in image cells) under a pointer on the map host. */
export function pointerToCell(
  pointer: { clientX: number; clientY: number },
  hostRect: { left: number; top: number },
  origin: { x: number; y: number },
  cellPx: number,
): Cell {
  return { x: (pointer.clientX - hostRect.left - origin.x) / cellPx, y: (pointer.clientY - hostRect.top - origin.y) / cellPx };
}

export interface OwnMove {
  plan: MovePlan;
  line: PathLine;
  /** Where the last step lands against the speed, which tints the sheet's feet. */
  state: SpeedState;
  /** "20 of 30 ft": the turn's total so far against the speed, or plain feet when no speed is known. */
  feetText: string;
  /** The same text the DM's path carries ("40 ft · a Dash"), for a screen reader. */
  label: string;
}

/**
 * The move that tapping `pointer` would make for a token at `from`, or null when it snaps back to the square it
 * stands on. `usedFeet` is what this turn has already spent; `speed` null means nothing on the sheet says, so the
 * feet show with no Dash colouring.
 */
export function ownMove(input: {
  instanceId: string;
  from: Cell;
  footprint: number;
  pointer: Cell;
  speed: number | null;
  usedFeet: number;
}): OwnMove | null {
  const { instanceId, from, footprint, pointer, speed, usedFeet } = input;
  return moveTo({ instanceId, from, footprint, to: snapAnchor(pointer, footprint), speed, usedFeet });
}

/** The same, for a square already snapped (a dragged token's preview). */
export function moveTo(input: {
  instanceId: string;
  from: Cell;
  footprint: number;
  to: Cell;
  speed: number | null;
  usedFeet: number;
}): OwnMove | null {
  const { instanceId, from, footprint, to, speed, usedFeet } = input;
  const plan = planMove({ from, to, footprint, terrain: OPEN_GROUND });
  if (plan.steps.length === 0) return null;
  const states: SpeedState[] = speed === null ? plan.steps.map((): SpeedState => "within") : stepStates(plan, usedFeet, speed);
  const total = usedFeet + plan.feet;
  return {
    plan,
    line: { id: instanceId, footprint, from, to, steps: plan.steps.map((s) => s.to), states },
    state: speed === null ? "within" : speedState(total, speed),
    feetText: speed === null ? `${total} ft` : `${total} of ${speed} ft`,
    label: moveLabel(plan, usedFeet, speed),
  };
}

/** The pan that puts the middle of a token at the middle of the host, given where the grid sits now. */
export function panToCentre(input: {
  hostW: number;
  hostH: number;
  origin: { x: number; y: number };
  cellPx: number;
  pan: { x: number; y: number };
  at: Cell;
  footprint: number;
}): { x: number; y: number } {
  const { hostW, hostH, origin, cellPx, pan, at, footprint } = input;
  const mid = footprint / 2;
  return {
    x: pan.x + hostW / 2 - (origin.x + (at.x + mid) * cellPx),
    y: pan.y + hostH / 2 - (origin.y + (at.y + mid) * cellPx),
  };
}

/**
 * The creature that acts just before `ownId` in the initiative order, by name, for "You're after the ogre". Only a
 * revealed one is named (an unseen or hidden combatant's name is the DM's to give), and null when the player is not
 * in the order or alone in it.
 */
export function actsBefore(sorted: readonly RunCombatant[], ownId: string): string | null {
  const at = sorted.findIndex((c) => c.instance_id === ownId);
  if (at < 0 || sorted.length < 2) return null;
  const before = sorted[(at - 1 + sorted.length) % sorted.length];
  return (before.reveal_state ?? "revealed") === "revealed" ? before.name : null;
}
