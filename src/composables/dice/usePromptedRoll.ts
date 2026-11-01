import { ref } from "vue";
import { rollDiceWithMode } from "@/systems/dnd5e/dice/roller";
import { withModeTag, type RollMode } from "@/systems/dnd5e/dice/rollMode";
import { scoreRoll } from "@/systems/dnd5e/dice/d20Roll";
import { playDiceRollSound } from "@/lib/dice/diceAudio";
import type { DieSize, RollResult } from "@/lib/dice/dice";
import { useDicePrefs } from "@/composables/dice/useDicePrefs";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { takeNextRollMode } from "@/systems/dnd5e/dice/useNextRollMode";

export interface PromptedRollArgs {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  label: string;
  mode?: RollMode;
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
  mode: RollMode;
  resolve: (result: RollResult | null) => void;
}

const pending = ref<PendingManualRoll | null>(null);

export function usePromptedRoll() {
  const { diceMode } = useDicePrefs();
  const { sendRoll } = useCampaignMessages();
  const { reportChatFailure } = useChatSendFailure();

  async function promptRoll(args: PromptedRollArgs): Promise<RollResult | null> {
    // A mode picked on the sheet applies to the next d20 roll anyone makes for
    // the player, whichever button made it. Damage and internal rolls never take it.
    const takesPick = (args.counts[20] ?? 0) > 0 && !args.silent && !args.isDamage;
    const base = args.mode ?? "normal";
    const mode = takesPick ? takeNextRollMode(base) : base;
    const label = mode === base ? args.label : withModeTag(args.label, mode);
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
      result = rollDiceWithMode(args.counts, args.modifier, mode, { mute: true });
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
    // A physical roll is scored by the same 5e rules as a digital one.
    const result: RollResult = { ...scoreRoll(p.counts, p.modifier, p.mode, values), manual: true };
    p.resolve(result);
  }

  return { promptRoll, pending, _resolveManual };
}
