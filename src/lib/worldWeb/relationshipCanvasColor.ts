// The World Web's canvas colour for an NPC's attitude. It lives here, not in `lib/npcDisplay.ts`, because it reads the
// DOM, and npcDisplay's name helpers are also imported by the fight rules that run in an edge function, where Deno has
// no DOM types: keeping it there failed `deno check` on encounter-command (#1234, 20 Nov 2026).

import { relationshipToken } from "@/lib/npcDisplay";
import type { NpcRelationship } from "@/types/npc.types";

/**
 * The colour as a concrete value, for painting to a canvas.
 *
 * The NPC web is a force-graph drawn on a canvas, and `ctx.fillStyle` cannot
 * take `var(--x)` or a class — it needs a resolved string. Reading the custom
 * property is the only way to keep that one consumer on the same ramp as
 * everything else rather than letting it keep a private copy, which is exactly
 * how it drifted: its copy was still keyed on the pre-5e values
 * (`ally`/`neutral`/`enemy`), so once `20260519000001` moved the enum on it
 * matched nothing and every node fell through to the default grey.
 *
 * Resolved at call time, so a graph rebuilt after a theme switch picks up the
 * new palette; one already on screen keeps the old colours until it re-renders.
 */
export function npcRelationshipCanvasColor(relationship: NpcRelationship): string {
  if (typeof document === "undefined") return "#6b7280";
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(relationshipToken(relationship))
    .trim();
  return resolved || "#6b7280";
}
