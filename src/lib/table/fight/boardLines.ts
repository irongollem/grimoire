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
 * One creature's turn as story lines. It never names a target's armour class or anyone's hit points
 * except the played character's own, and only when they were hit.
 */
export function linesOfCreatureTurn(input: CreatureTurnInput): BoardLine[] {
  const { turn, outcomes, nameOf, feetMoved, playedInstanceId, playedHp } = input;
  const name = nameOf(turn.instanceId);
  const lines: BoardLine[] = [];
  if (feetMoved > 0) lines.push({ kind: "margin", text: `${name} moves ${feetMoved} feet` });
  for (const o of outcomes) {
    if (o.kind !== "attack") continue;
    const target = nameOf(o.targetId);
    const result = !o.hit ? "a miss" : o.critical ? `a critical hit, ${damageText(o)}` : `a hit, ${damageText(o)}`;
    lines.push({
      kind: "roll",
      die: o.total,
      label: `${o.action} against ${target}: ${result}`,
      detail: bonusText(o.natural, o.total),
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
  if (turn.leftTheMap === true) lines.push({ kind: "margin", text: `${name} flees the fight` });
  if (lines.length === 0) lines.push({ kind: "margin", text: `${name} holds its ground` });
  return lines;
}
