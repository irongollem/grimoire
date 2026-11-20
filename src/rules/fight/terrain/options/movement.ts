// The options that move the creature without attacking: Dodge (rule 4), the approach (rule 2 and the Move option),
// Disengage (rule 3) and Hide (rule 5).

import type { Cell } from "../../../../lib/battlemap/movement.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { ReachCell, ReachResult } from "../reach.ts";
import { distanceFeet, type Box, type ProvokedAttack } from "../sight.ts";
import { exposurePhrase, provokesPhrase } from "./phrases.ts";
import { boxOf, cellKey, cellsOf, compareExposure, emptyMovement, exposureAt, provokesOf, type Scene } from "./scene.ts";
import type { TurnOption } from "./types.ts";

/** Rule 4 (the option itself): Dodge is always there, standing where it stands. */
export function dodgeOption(scene: Scene | null): TurnOption {
  const start = scene === null ? null : scene.reach.start;
  return {
    id: "dodge",
    kind: "dodge",
    targetId: null,
    attack: null,
    summary: "Dodge: stay put and take the Dodge action",
    ...(scene && start
      ? { destination: start, path: [start], feet: 0, distanceFeet: null, provokes: [], exposure: exposureAt(scene, start) }
      : emptyMovement()),
  };
}

/**
 * Rules 2 and the Move option: the square nearest a target, searched with the given reach. Fewest opportunity attacks
 * and fewest feet break a tie in distance. Null when the best square is where the creature already stands (nothing to
 * offer).
 */
export function nearestSquare(scene: Scene, reach: ReachResult, target: RunCombatant): { rc: ReachCell; distance: number; provokes: ProvokedAttack[] } | null {
  const targetBox = boxOf(target);
  let best: { rc: ReachCell; distance: number; provokes: ProvokedAttack[] } | null = null;
  for (const rc of cellsOf(reach)) {
    const distance = distanceFeet({ anchor: rc.cell, footprint: scene.moverFootprint }, targetBox);
    const found = { rc, distance, provokes: provokesOf(scene, rc) };
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        (found.provokes.length < best.provokes.length ||
          (found.provokes.length === best.provokes.length && found.rc.feet < best.rc.feet)))
    ) {
      best = found;
    }
  }
  if (best === null || reach.start === null || cellKey(best.rc.cell) === cellKey(reach.start)) return null;
  return best;
}

/** One approach option (Dash with the doubled search, Move with the normal one) toward a hostile. */
export function approachOption(kind: "dash" | "move", scene: Scene, names: Map<string, string>, target: RunCombatant, reach: ReachResult): TurnOption | null {
  const found = nearestSquare(scene, reach, target);
  if (found === null) return null;
  const targetName = names.get(target.instance_id);
  const verb = kind === "dash" ? "Dash" : "Move";
  const exposure = exposureAt(scene, found.rc.cell);
  return {
    id: `${kind}:${target.instance_id}`,
    kind,
    targetId: target.instance_id,
    destination: found.rc.cell,
    path: found.rc.path,
    feet: found.rc.feet,
    attack: null,
    distanceFeet: found.distance,
    provokes: found.provokes,
    exposure,
    summary: `${verb} ${found.rc.feet} ft toward ${targetName}, ending ${found.distance} ft away${exposurePhrase(names, exposure)}${provokesPhrase(names, found.provokes)}`,
  };
}

/**
 * Rule 3: Disengage, only when an enemy that could take an opportunity attack has the creature in reach. It ends on
 * the square (normal budget) farthest from its nearest hostile; ties go to the most cover, then fewest feet. Its path
 * provokes nothing. Not offered when no square is farther from the nearest hostile than where it already stands.
 */
export function disengageOption(scene: Scene): TurnOption | null {
  const here: Box = { anchor: scene.reach.start as Cell, footprint: scene.moverFootprint };
  const nearest = (box: Box) => Math.min(...scene.hostiles.map((h) => distanceFeet(box, boxOf(h))));
  const threatened = scene.enemies.some((e) => !e.reactionUsed && !e.cannotReact && !e.incapacitated && distanceFeet(here, e.box) <= e.reachFeet);
  if (!threatened) return null;
  let best: { rc: ReachCell; away: number } | null = null;
  for (const rc of cellsOf(scene.reach)) {
    const away = nearest({ anchor: rc.cell, footprint: scene.moverFootprint });
    if (best === null || away > best.away) {
      best = { rc, away };
    } else if (away === best.away) {
      const exposure = compareExposure(exposureAt(scene, rc.cell), exposureAt(scene, best.rc.cell));
      if (exposure < 0 || (exposure === 0 && rc.feet < best.rc.feet)) best = { rc, away };
    }
  }
  if (best === null || best.away <= nearest(here)) return null;
  return {
    id: "disengage",
    kind: "disengage",
    targetId: null,
    destination: best.rc.cell,
    path: best.rc.path,
    feet: best.rc.feet,
    attack: null,
    distanceFeet: null,
    provokes: [],
    exposure: exposureAt(scene, best.rc.cell),
    summary: `Disengage: move ${best.rc.feet} ft to a square ${best.away} ft from the nearest enemy, with no opportunity attacks`,
  };
}

/**
 * Rule 5: Hide, only when some reachable square has total cover against every living hostile on the map; the nearest
 * such square (fewest feet). Darkness and invisibility are not modelled, only walls, closed doors and rock.
 */
export function hideOption(scene: Scene, names: Map<string, string>): TurnOption | null {
  if (scene.hostiles.length === 0) return null;
  let best: ReachCell | null = null;
  for (const rc of cellsOf(scene.reach)) {
    if (!exposureAt(scene, rc.cell).every((e) => e.cover === "total")) continue;
    if (best === null || rc.feet < best.feet) best = rc;
  }
  if (best === null) return null;
  return {
    id: "hide",
    kind: "hide",
    targetId: null,
    destination: best.cell,
    path: best.path,
    feet: best.feet,
    attack: null,
    distanceFeet: null,
    provokes: provokesOf(scene, best),
    exposure: exposureAt(scene, best.cell),
    summary: `Hide: ${best.feet === 0 ? "stay put, where" : `move ${best.feet} ft to a square where`} no enemy has a line, then take the Hide action${provokesPhrase(names, provokesOf(scene, best))}`,
  };
}
