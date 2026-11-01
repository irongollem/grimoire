import { ref } from "vue";
import { activeDiceRules } from "@/systems/registry";
import { ALL_DICE } from "@/lib/dice/dice";
import { NORMAL_ROLL, type RollModeKey } from "@/lib/dice/diceRules";
import { rollDiceWithRules } from "@/lib/dice/roller";
import { playDiceRollSound } from "@/lib/dice/diceAudio";
import type { DieSize, RollResult } from "@/lib/dice/dice";
import { useDicePrefs } from "@/composables/dice/useDicePrefs";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { takeNextRollMode } from "@/composables/dice/useNextRollMode";

export interface PromptedRollArgs {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  mode?: RollModeKey;
  recipientUserId?: string | null;
  senderName?: string;
  /** Skip posting to chat (e.g. internal mechanics rolls). Default false. */
  silent?: boolean;
  /** Flag as a damage/healing roll — chat renders breakdown instead of d20 display. */
  isDamage?: boolean;
}

export interface PendingManualRoll {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  mode: RollModeKey;
  resolve: (result: RollResult | null) => void;
}

const pending = ref<PendingManualRoll | null>(null);

export function usePromptedRoll() {
  const { diceMode } = useDicePrefs();
  const { sendRoll } = useCampaignMessages();
  const { reportChatFailure } = useChatSendFailure();

  async function promptRoll(args: PromptedRollArgs): Promise<RollResult | null> {
    // Resolved per call so the active campaign's system decides, not the module load.
    const rules = activeDiceRules();
    // An option picked on the sheet applies to the next roll it applies to that
    // anyone makes for the player (5e: a d20), whichever button made it. Damage
    // and internal rolls never take it.
    const poolTakesOption = ALL_DICE.some((sides) => (args.counts[sides] ?? 0) > 0 && rules.optionAppliesTo(sides));
    const takesPick = poolTakesOption && !args.silent && !args.isDamage;
    const base = args.mode ?? NORMAL_ROLL;
    const mode = takesPick ? takeNextRollMode(base) : base;
    const label = mode === base ? args.label : rules.tagLabel(args.label, mode);
    let result: RollResult | null = null;

    const isHidden = !!args.recipientUserId;

    if (diceMode.value === "physical") {
      const manual = await new Promise<RollResult | null>((resolve) => {
        pending.value = {
          counts: args.counts,
          modifier: args.modifier,
          label,
          mode,
          resolve,
        };
      });
      result = manual;
      // Play sound manually for physical rolls — suppress fumble on hidden rolls
      if (result) playDiceRollSound(result.isCrit, isHidden ? false : result.isFumble);
    } else {
      // Mute automatic sound so we can control fumble suppression
      result = rollDiceWithRules(rules, args.counts, args.modifier, mode, { mute: true });
      if (result) playDiceRollSound(result.isCrit, isHidden ? false : result.isFumble);
    }

    if (result) {
      if (label) result.label = label;
      if (args.isDamage) result.isDamage = true;
      if (!args.silent) {
        // The roll happened whether or not the table hears of it, so a failed
        // post toasts and the caller still gets its result.
        await sendRoll(result, args.recipientUserId ?? null, args.senderName).catch((e) =>
          reportChatFailure(e, "post the roll to the chat"),
        );
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
    // A physical roll is scored by the same rules as a digital one.
    const result: RollResult = { ...activeDiceRules().score(p.counts, p.modifier, p.mode, values), manual: true };
    p.resolve(result);
  }

  return { promptRoll, pending, _resolveManual };
}
