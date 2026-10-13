/**
 * One line of plain words for an `ActionStructure` (#1017): what the runner will
 * roll for this entry. The editor shows it under each action ("Rolls as"), and the
 * display and runner surfaces can reuse it. Pure and dependency-light on purpose.
 */
import type {
  ActionOption,
  ActionStructure,
  AttackStructure,
  DamagePart,
  SaveEnds,
  SaveStructure,
} from "@/types/statBlock.types";

export interface StructureDescription {
  /** The roll in words, or null when nothing is rolled (kind "other", an empty multiattack). */
  summary: string | null;
  /** Short facts about use: "Recharge 5–6", "3/day", "Costs 2". */
  badges: string[];
  /**
   * Present for an "options" entry: one line per choice, so a surface can list
   * them. `summary` carries the same choices joined ("One of: A (…) · B (…)").
   */
  options?: Array<{ name: string; summary: string }>;
}

const SEP = " · ";

const USES_PER = { day: "day", short_rest: "short rest", long_rest: "long rest" } as const;

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function parts(list: DamagePart[]): string {
  return list.map((p) => (p.type ? `${p.dice} ${p.type}` : p.dice)).join(" + ");
}

function describeAttack(a: AttackStructure): string[] {
  const out = [`${signed(a.bonus)} to hit`];
  if (a.reach !== undefined) out.push(`reach ${a.reach} ft`);
  if (a.range) out.push(`range ${a.range.normal}${a.range.long !== undefined ? `/${a.range.long}` : ""} ft`);
  if (a.hit.length > 0) out.push(parts(a.hit));
  return out;
}

/** "DC 14 Dex": the save as a player reads it. Shared with the player surfaces. */
export function saveLabel(s: Pick<SaveStructure, "ability" | "dc">): string {
  return `DC ${s.dc} ${s.ability.charAt(0).toUpperCase()}${s.ability.slice(1)}`;
}

/** "save ends", "until the end of the target's next turn", "10 rounds" (#1050). */
export function describeSaveEnds(ends: SaveEnds): string {
  switch (ends.kind) {
    case "save":
      return `${ends.at === "start" ? "save ends at turn start" : "save ends"}${ends.remaining === undefined ? "" : `, max ${ends.remaining} ${ends.remaining === 1 ? "round" : "rounds"}`}`;
    case "turn":
      return `until the ${ends.at} of ${ends.of === "self" ? "the target's" : "this creature's"} next turn`;
    case "rounds":
      return `${ends.remaining} ${ends.remaining === 1 ? "round" : "rounds"}`;
  }
}

function describeSave(s: SaveStructure): string[] {
  const out = [`${saveLabel(s)} save`];
  if (s.fail.length > 0) out.push(s.success === "half" ? `${parts(s.fail)}, half on success` : parts(s.fail));
  if (s.conditions.length > 0) {
    out.push(s.conditions.map((c) => (c.ends ? `${c.name} (${describeSaveEnds(c.ends)})` : c.name)).join(", "));
  }
  return out;
}

function describeOption(o: ActionOption): string {
  const segments: string[] = [];
  if (o.kind === "attack" && o.attack) segments.push(...describeAttack(o.attack));
  if (o.save) segments.push(...describeSave(o.save));
  return segments.join(SEP);
}

export function describeStructure(structure: ActionStructure): StructureDescription {
  const segments: string[] = [];
  let options: StructureDescription["options"];
  if (structure.kind === "attack" && structure.attack) segments.push(...describeAttack(structure.attack));
  if ((structure.kind === "attack" || structure.kind === "save") && structure.save) {
    segments.push(...describeSave(structure.save));
  }
  if (structure.kind === "options" && structure.options && structure.options.length > 0) {
    options = structure.options.map((o) => ({ name: o.name, summary: describeOption(o) }));
    segments.push(`One of: ${options.map((o) => `${o.name} (${o.summary})`).join(SEP)}`);
  }
  if (structure.kind === "multiattack" && structure.multiattack && structure.multiattack.length > 0) {
    segments.push(structure.multiattack.map((s) => `${s.count}× ${s.action}`).join(", "));
  }

  const badges: string[] = [];
  if (structure.recharge) {
    const { min, max } = structure.recharge;
    badges.push(min === max ? `Recharge ${min}` : `Recharge ${min}–${max}`);
  }
  if (structure.uses) badges.push(`${structure.uses.count}/${USES_PER[structure.uses.per]}`);
  if (structure.legendary_cost !== undefined) badges.push(`Costs ${structure.legendary_cost}`);

  return { summary: segments.length > 0 ? segments.join(SEP) : null, badges, ...(options ? { options } : {}) };
}
