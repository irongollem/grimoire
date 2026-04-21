import { ref } from "vue";
import { rollDice } from "@/lib/roller";
import { playDiceRollSound } from "@/lib/diceAudio";
import type { DieSize, RollMode, RollResult, DieResult } from "@/lib/dice";
import { useDicePrefs } from "@/composables/useDicePrefs";
import { useCampaignMessages } from "@/composables/useCampaignMessages";

export interface PromptedRollArgs {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  mode?: RollMode;
  recipientUserId?: string | null;
  senderName?: string;
  /** Skip posting to chat (e.g. internal mechanics rolls). Default false. */
  silent?: boolean;
}

export interface PendingManualRoll {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  mode: RollMode;
  resolve: (result: RollResult | null) => void;
}

const pending = ref<PendingManualRoll | null>(null);

function buildLabel(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode,
  hasD20: boolean,
): string {
  const parts: string[] = [];
  for (const sides of [4, 6, 8, 10, 12, 20, 100] as DieSize[]) {
    const n = counts[sides] ?? 0;
    if (n > 0) parts.push(`${n}d${sides}`);
  }
  if (modifier !== 0) parts.push(modifier > 0 ? `+${modifier}` : `${modifier}`);
  const modeSuffix = hasD20 && mode !== "normal" ? ` (${mode === "advantage" ? "Adv" : "Dis"})` : "";
  return parts.join("+") + modeSuffix;
}

export function usePromptedRoll() {
  const { diceMode } = useDicePrefs();
  const { sendRoll } = useCampaignMessages();

  async function promptRoll(args: PromptedRollArgs): Promise<RollResult | null> {
    const mode = args.mode ?? "normal";
    let result: RollResult | null = null;

    const isHidden = !!args.recipientUserId;

    if (diceMode.value === "physical") {
      const manual = await new Promise<RollResult | null>((resolve) => {
        pending.value = {
          counts: args.counts,
          modifier: args.modifier,
          label: args.label,
          mode,
          resolve,
        };
      });
      result = manual;
      // Play sound manually for physical rolls — suppress fumble on hidden rolls
      if (result) playDiceRollSound(result.isCrit, isHidden ? false : result.isFumble);
    } else {
      // Mute automatic sound so we can control fumble suppression
      result = rollDice(args.counts, args.modifier, mode, { mute: true });
      if (result) playDiceRollSound(result.isCrit, isHidden ? false : result.isFumble);
    }

    if (result) {
      if (args.label) result.label = args.label;
      if (!args.silent) {
        await sendRoll(result, args.recipientUserId ?? null, args.senderName);
      }
    }
    return result;
  }

  function _resolveManual(values: Record<DieSize, number[]> | null): void {
    const p = pending.value;
    if (!p) return;
    pending.value = null;
    if (values === null) {
      p.resolve(null);
      return;
    }
    const breakdown: DieResult[] = [];
    let sum = 0;
    let isCrit = false;
    let isFumble = false;

    for (const sides of [4, 6, 8, 10, 12, 20, 100] as DieSize[]) {
      const entered = values[sides] ?? [];
      const need = p.counts[sides] ?? 0;
      if (need === 0 || entered.length === 0) continue;

      if (sides === 20 && need === 1 && p.mode !== "normal" && entered.length === 2) {
        const [r1, r2] = entered;
        const keep = p.mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
        const drop = p.mode === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);
        breakdown.push({ val: keep, dropped: false });
        breakdown.push({ val: drop, dropped: true });
        sum += keep;
        if (keep === 20) isCrit = true;
        if (keep === 1) isFumble = true;
      } else {
        for (const val of entered) {
          breakdown.push({ val, dropped: false });
          sum += val;
          if (sides === 20 && val === 20) isCrit = true;
          if (sides === 20 && val === 1) isFumble = true;
        }
      }
    }

    const hasD20 = (p.counts[20] ?? 0) > 0;
    const result: RollResult = {
      total: sum + p.modifier,
      label: buildLabel(p.counts, p.modifier, p.mode, hasD20),
      modifier: p.modifier,
      breakdown,
      isCrit,
      isFumble,
      manual: true,
    };
    p.resolve(result);
  }

  return { promptRoll, pending, _resolveManual };
}
