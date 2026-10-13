// How a condition's end, source and ongoing damage read on a badge (#1018).
// Pure: the caller supplies `nameOf`, which decides which combatants the viewer
// may see named, so a hidden creature is never named through its condition.

import type { AppliedCondition, OngoingDamage } from "@/types/condition.types";

/** Resolves a combatant instance id to a name the viewer may see, or null (unknown, hidden, not in this fight). */
export type NameOf = (instanceId: string) => string | null;

/** "until the end of its next turn", "3 rounds left", "save ends · WIS 14", "save ends · WIS 14 · 3 rounds left"; null when it lasts until removed. */
export function describeConditionEnd(c: AppliedCondition, nameOf: NameOf): string | null {
  const ends = c.ends;
  if (!ends) return null;
  switch (ends.kind) {
    case "turn": {
      const edge = ends.at === "start" ? "start" : "end";
      if (ends.of === "self") return `until the ${edge} of its next turn`;
      const name = c.source ? nameOf(c.source.id) : null;
      return name
        ? `until the ${edge} of ${name}'s next turn`
        : `until the ${edge} of its source's next turn`;
    }
    case "rounds":
      return `${ends.remaining} ${ends.remaining === 1 ? "round" : "rounds"} left`;
    case "save": {
      const base = `save ends · ${ends.ability.toUpperCase()} ${ends.dc}`;
      const timed = ends.at === "start" ? `${base} at turn start` : base;
      if (ends.remaining === undefined) return timed;
      return `${timed} · ${ends.remaining} ${ends.remaining === 1 ? "round" : "rounds"} left`;
    }
  }
}

/** "Vex · Hold Person", "Hold Person", "Vex"; null when nothing is known. */
export function describeConditionSource(c: AppliedCondition, nameOf: NameOf): string | null {
  const source = c.source;
  if (!source) return null;
  const parts: string[] = [];
  const name = nameOf(source.id);
  if (name) parts.push(name);
  if (source.spell) parts.push(source.spell);
  if (parts.length === 0) return null;
  const text = parts.join(" · ");
  return source.concentration ? `${text} (concentration)` : text;
}

export function describeOngoing(o: OngoingDamage): string {
  const what = o.type ? `${o.dice} ${o.type}` : `${o.dice} damage`;
  return `${what} at the ${o.at === "start" ? "start" : "end"} of each turn`;
}
