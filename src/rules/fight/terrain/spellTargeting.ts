// Who a damage spell could be cast at from where the caster stands (#1021, row 5b step B): the geometry of a cast, kept
// apart from the turn options that wrap it (`turnOptions.ts` turns each targeting into an option with an id and a summary).
// Pure and edge-importable (relative `.ts` imports only). It stands on the same range, line and distance helpers the
// attack options use (`distanceFeet`, `coverBetween`).
//
// APP CONVENTIONS (the books give a template, not a procedure for a monster):
// - A spell is cast from where the caster stands: no move is offered with it. Closing in is the Move and Dash options' job.
// - A spell's range is the record's `range` text. A number of feet is that far; "Touch" is 5 feet; "Self" means the caster.
//   Text this cannot read ("Sight", "Unlimited", a missing range) is treated as reaching any distance, because refusing
//   what the data does not forbid would silence a creature for a typo.
// - A sphere, cylinder or cube is centred on a creature, as the book lets a caster pick a point: the centre is each living
//   enemy in range and in line of sight in turn, and the area catches every creature within its size of that centre.
//   An emanation, and any area spell whose range is Self, is centred on the caster, and the caster is not in it
//   (SRD 5.1 "Thunderwave", "Spirit Guardians": the caster is excluded). A creature in the area is caught only when it is
//   not wholly walled off from the centre (`coverBetween` is not "total"); a wall stops an area, it does not bend round it.
// - Cone and line are NOT offered. They need a template with a direction, and fitting one to a position would be an
//   approximation of a rule this does not model. A spell whose shape is anything else is left out the same way.
// - With nothing to measure on (no map, or a caster with no place on it) every spell, area or not, is offered as one
//   single-target cast per living enemy, catching no friend: nobody knows where anyone stands.

import type { Cell } from "../../../lib/battlemap/movement.ts";
import type { Occluders } from "../../../lib/battlemap/occlusion.ts";
import { combatantFootprint } from "../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { CastNow } from "../spells/castNow.ts";
import { kindAllowed } from "../spells/creatureKind.ts";
import { coverBetween, distanceFeet, DEFAULT_REACH_FEET, type Box } from "./sight.ts";

/** One way to cast one spell: who is the centre (null when centred on the caster), who is hit, and which friends are caught. */
export interface SpellTargeting {
  cast: CastNow;
  centerId: string | null;
  targetIds: string[];
  friendsCaught: string[];
  /** Feet from the caster to the single target or to the centre; null when centred on the caster or nothing was measured. */
  distanceFeet: number | null;
}

/** The area shapes that are cast at a point or from the caster. `cone` and `line` are left out on purpose (see above). */
const OFFERED_SHAPES: ReadonlySet<string> = new Set(["sphere", "cylinder", "cube", "emanation"]);

/** A spell's range in feet; "self" for a spell cast on the caster; null when the text says nothing this can read. */
export function rangeFeetOf(text: string): number | "self" | null {
  const t = text.trim().toLowerCase();
  if (t.startsWith("self")) return "self";
  if (t.startsWith("touch")) return DEFAULT_REACH_FEET;
  const found = /(\d+(?:\.\d+)?)\s*(feet|foot|ft|mile)/.exec(t);
  if (found === null) return null;
  return found[2] === "mile" ? Number(found[1]) * 5280 : Number(found[1]);
}

/** The board a measured cast is worked out on. */
export interface SpellScene {
  occluders: Occluders;
  /** Every creature on the board, the caster included: what stands in a line. */
  onBoard: readonly RunCombatant[];
}

export interface SpellTargetingInput {
  mover: RunCombatant;
  /** Living creatures hostile to the mover (on the board, when there is a scene). */
  hostiles: readonly RunCombatant[];
  /** Living creatures on the mover's side, the mover excluded (on the board, when there is a scene). */
  allies: readonly RunCombatant[];
  /** Null when nothing can be measured. */
  scene: SpellScene | null;
  spells: readonly CastNow[];
  /**
   * The creature kind of a combatant, or null when it is not known (`creatureKindOf`). With it a spell limited to a kind
   * is offered only at hostiles of a known, allowed kind; without it such a spell is not offered at all, because nothing
   * could keep it from the wrong creature. A spell with no kind limit is never affected.
   */
  kindOf?: (c: RunCombatant) => string | null;
}

function boxOf(c: RunCombatant): Box | null {
  const at: Cell | null | undefined = c.position;
  return at === null || at === undefined ? null : { anchor: at, footprint: combatantFootprint(c) };
}

export function spellTargetings(input: SpellTargetingInput): SpellTargeting[] {
  const out: SpellTargeting[] = [];
  const { mover, scene } = input;
  for (const cast of input.spells) {
    const limit = cast.kindLimit;
    if (limit !== null && input.kindOf === undefined) continue;
    const { kindOf } = input;
    const hostiles = limit === null || kindOf === undefined ? input.hostiles : input.hostiles.filter((h) => kindAllowed(kindOf(h), limit));
    if (cast.area !== null && !OFFERED_SHAPES.has(cast.area.shape)) continue;
    const range = rangeFeetOf(cast.record.range);
    // A spell cast on the caster that covers no area has no one else to hit.
    if (range === "self" && cast.area === null) continue;

    if (scene === null) {
      for (const h of hostiles) out.push({ cast, centerId: h.instance_id, targetIds: [h.instance_id], friendsCaught: [], distanceFeet: null });
      continue;
    }
    const moverBox = boxOf(mover);
    if (moverBox === null) continue;
    const see = (from: RunCombatant, fromBox: Box, to: RunCombatant, toBox: Box): boolean =>
      coverBetween(fromBox, toBox, scene.occluders, scene.onBoard.filter((o) => o.instance_id !== from.instance_id && o.instance_id !== to.instance_id).flatMap((o) => boxOf(o) ?? [])) !== "total";
    const placed = (list: readonly RunCombatant[]) => list.flatMap((c) => { const box = boxOf(c); return box === null ? [] : [{ c, box }]; });
    const enemies = placed(hostiles);
    const friends = placed(input.allies);

    if (cast.area === null) {
      for (const { c, box } of enemies) {
        const feet = distanceFeet(moverBox, box);
        if (typeof range === "number" && feet > range) continue;
        if (!see(mover, moverBox, c, box)) continue;
        out.push({ cast, centerId: c.instance_id, targetIds: [c.instance_id], friendsCaught: [], distanceFeet: feet });
      }
      continue;
    }

    const { area } = cast;
    /** What an area centred on `center` catches, or null when it catches no enemy. */
    const catching = (center: RunCombatant, centerBox: Box, caster: boolean): { targetIds: string[]; friendsCaught: string[] } | null => {
      const inArea = (c: RunCombatant, box: Box) => (c.instance_id === center.instance_id && !caster) || (distanceFeet(centerBox, box) <= area.feet && see(center, centerBox, c, box));
      const targetIds = enemies.filter(({ c, box }) => inArea(c, box)).map(({ c }) => c.instance_id);
      if (targetIds.length === 0) return null;
      const friendsCaught = friends.filter(({ c, box }) => inArea(c, box)).map(({ c }) => c.instance_id);
      // The caster stands in a point-centred area when it is within its size of the centre; never in its own emanation.
      if (!caster && distanceFeet(centerBox, moverBox) <= area.feet && see(center, centerBox, mover, moverBox)) friendsCaught.push(mover.instance_id);
      return { targetIds, friendsCaught };
    };

    if (area.shape === "emanation" || range === "self") {
      const caught = catching(mover, moverBox, true);
      if (caught !== null) out.push({ cast, centerId: null, ...caught, distanceFeet: null });
      continue;
    }
    // Nearest centre first, so two centres that catch the same creatures keep the nearer one.
    const centres = [...enemies].sort((a, b) => distanceFeet(moverBox, a.box) - distanceFeet(moverBox, b.box));
    const seen = new Set<string>();
    for (const { c, box } of centres) {
      const feet = distanceFeet(moverBox, box);
      if (typeof range === "number" && feet > range) continue;
      if (!see(mover, moverBox, c, box)) continue;
      const caught = catching(c, box, false);
      if (caught === null) continue;
      const key = `${[...caught.targetIds].sort().join(",")}|${[...caught.friendsCaught].sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cast, centerId: c.instance_id, ...caught, distanceFeet: feet });
    }
  }
  return out;
}
