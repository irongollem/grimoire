import type { ResolvedAction, TurnTaken } from "@/rules/fight/fightState";

export type BoardLine =
  | { kind: "margin"; text: string; tone?: "harm" | "end" }
  | { kind: "roll"; die: number; label: string; detail: string; critical: boolean };

export interface CreatureTurnInput {
  turn: TurnTaken;
  outcomes: readonly ResolvedAction[];
  nameOf: (instanceId: string) => string;
  feetMoved: number;
  playedInstanceId: string;
  playedHp: { hp: number; maxHp: number } | null;
}

type Attack = Extract<ResolvedAction, { kind: "attack" }>;

function damageText(a: Attack): string {
  const parts = a.damage
    .filter((d) => d.applied > 0)
    .map((d) => (d.type === null ? `${d.applied}` : `${d.applied} ${d.type}`));
  if (parts.length === 0) return "no damage";
  return parts.join(" and ");
}

function bonusText(natural: number, total: number): string {
  const bonus = total - natural;
  if (bonus === 0) return `d20 (${natural})`;
  return bonus > 0 ? `d20 (${natural}) + ${bonus}` : `d20 (${natural}) - ${Math.abs(bonus)}`;
}

/**
 * The attacks among what was resolved, as story lines: the roll, and the played character's hit points when they were
 * hit. An attack by anyone but `turnOf` (null when it is nobody's turn to attack: a walk that provoked) is an
 * opportunity attack, and says whose it was.
 */
export function linesOfAttacks(
  outcomes: readonly ResolvedAction[],
  input: { nameOf: (instanceId: string) => string; playedInstanceId: string; playedHp: { hp: number; maxHp: number } | null; turnOf: string | null },
): BoardLine[] {
  const { nameOf, playedInstanceId, playedHp, turnOf } = input;
  const lines: BoardLine[] = [];
  for (const o of outcomes) {
    if (o.kind !== "attack") continue;
    const target = nameOf(o.targetId);
    const result = !o.hit ? "a miss" : o.critical ? `a critical hit, ${damageText(o)}` : `a hit, ${damageText(o)}`;
    const what = o.attackerId === turnOf ? o.action : `${nameOf(o.attackerId)}'s opportunity attack (${o.action})`;
    lines.push({
      kind: "roll",
      die: o.total,
      label: `${what} against ${target}: ${result}`,
      // Rolled twice and one kept: said, so a Dodge or a hiding place is seen to have counted.
      detail: o.mode === "normal" ? bonusText(o.natural, o.total) : `${bonusText(o.natural, o.total)}, with ${o.mode}`,
      critical: o.critical,
    });
    if (o.hit && o.targetId === playedInstanceId && playedHp !== null) {
      lines.push({
        kind: "margin",
        tone: "harm",
        text: `${target} is at ${playedHp.hp} of ${playedHp.maxHp} hit points`,
      });
    }
  }
  return lines;
}

/**
 * One creature's turn as story lines. It never names a target's armour class or anyone's hit points
 * except the played character's own, and only when they were hit.
 */
export function linesOfCreatureTurn(input: CreatureTurnInput): BoardLine[] {
  const { turn, outcomes, nameOf, feetMoved, playedInstanceId, playedHp } = input;
  const name = nameOf(turn.instanceId);
  const lines: BoardLine[] = [];
  if (feetMoved > 0) lines.push({ kind: "margin", text: `${name} moves ${feetMoved} feet` });
  // A blow struck by someone else during this turn is an opportunity attack on the creature as it walks away.
  lines.push(...linesOfAttacks(outcomes, { nameOf, playedInstanceId, playedHp, turnOf: turn.instanceId }));
  if (turn.leftTheMap === true) lines.push({ kind: "margin", text: `${name} flees the fight` });
  if (lines.length === 0) lines.push({ kind: "margin", text: `${name} holds its ground` });
  return lines;
}
