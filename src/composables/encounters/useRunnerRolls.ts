import { ref, type Ref } from "vue";
import type { RunnerCheckResult } from "@/components/encounters/RunnerRollBanner.vue";
import type { CheckMode } from "@/components/encounters/RunnerRollModeToggle.vue";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { parseExpression } from "@/lib/dice/dice";
import type { DieSize, RollResult } from "@/lib/dice/roller";

/** "2d6+3" for a dice string, or "" when it holds nothing rollable. */
export function actionDiceLabel(desc: string): string {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return "";
  const diceStr = parsed.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = parsed.modifier;
  return diceStr + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "");
}

export function hasRollableDice(desc: string): boolean {
  const parsed = parseExpression(desc);
  return !!parsed && parsed.terms.length > 0;
}

export function parsedTermsToCounts(terms: { count: number; sides: number }[]): Partial<Record<DieSize, number>> {
  const counts: Partial<Record<DieSize, number>> = {};
  for (const t of terms) {
    if ([4, 6, 8, 10, 12, 20, 100].includes(t.sides)) {
      const k = t.sides as DieSize;
      counts[k] = (counts[k] ?? 0) + t.count;
    }
  }
  return counts;
}

/**
 * The runner's check, attack and damage rolls, shared by the full sheet (`RunnerEntityDetail`) and the Play
 * turn card, so a roll from either goes through one pipeline: the prompted roll, the chat post and the banner.
 */
export function useRunnerRolls(opts: { senderName: () => string; rollMode: Ref<CheckMode>; silent: () => boolean }) {
  const { promptRoll } = usePromptedRoll();
  const lastCheck = ref<RunnerCheckResult | null>(null);

  async function performCheck(modifier: number, label: string): Promise<RollResult | null> {
    const r = await promptRoll({
      counts: { 20: 1 },
      modifier,
      label,
      mode: opts.rollMode.value,
      senderName: opts.senderName(),
      silent: opts.silent(),
    });
    if (!r) return null;
    const kept = r.breakdown.find((d) => !d.dropped)!;
    const dropped = r.breakdown.find((d) => d.dropped);
    lastCheck.value = {
      total: r.total,
      label,
      modifier,
      d20: kept.val,
      dropped: dropped?.val,
      isCrit: r.isCrit,
      isFumble: r.isFumble,
    };
    return r;
  }

  function rollAttack(attackBonus: number, actionName: string, onResolved?: (rolled: boolean, crit?: boolean) => void) {
    void performCheck(attackBonus, actionName + " Attack").then((r) => onResolved?.(!!r, r?.isCrit));
  }

  async function rollActionDamage(desc: string, actionName: string) {
    const parsed = parseExpression(desc);
    if (!parsed || !parsed.terms.length) return;
    const label = `${actionName} (${actionDiceLabel(desc)})`;
    const r = await promptRoll({
      counts: parsedTermsToCounts(parsed.terms),
      modifier: parsed.modifier,
      label,
      senderName: opts.senderName(),
      silent: opts.silent(),
    });
    if (!r) return;
    lastCheck.value = { total: r.total, label, modifier: parsed.modifier, d20: r.breakdown[0]?.val ?? r.total, isCrit: false, isFumble: false };
  }

  /** A PC's damage from the rider panel has already been rolled and posted; the banner just shows it. */
  function onPcDamageRolled(r: RollResult) {
    lastCheck.value = { total: r.total, label: r.label, modifier: r.modifier, d20: r.breakdown[0]?.val ?? r.total, isCrit: false, isFumble: false };
  }

  return { lastCheck, performCheck, rollAttack, rollActionDamage, onPcDamageRolled };
}
