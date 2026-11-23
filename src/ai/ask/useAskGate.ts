/**
 * Ask Grimoire (#1253): why a quote's gilt button cannot run, said once for every generator.
 *
 * The same four gates the generator's own page applies before it spends anything, in the order the page meets them:
 * AI switched off for the campaign, a generator the campaign's game system does not offer, the plan's quota for what
 * it makes (`useGenerationGate`), and a balance that is short. The page opens a paywall or a dialog for the last two;
 * Ask states them on the quote instead, and `run` checks again in case the state moved while the DM read it.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useQuota } from "@/composables/billing/useQuota";
import { useGameSystem } from "@/composables/rules/useGameSystem";
import type { AskQuoteBlock } from "@/lib/ask/askAdapter";
import type { QuotaResource } from "@/types/subscription.types";

export interface AskGateInput {
  total: number | null;
  byok: boolean;
  /** A 5e-only generator: needs a game system that offers stat blocks. */
  fiveE?: boolean;
}

export function useAskGate(resource: QuotaResource | null, noun: string) {
  const campaign = useCampaignStore();
  const { affordable } = useAiCredits();
  const { offers } = useGameSystem();
  const quota = resource ? useQuota(resource) : null;

  function blockFor({ total, byok, fiveE }: AskGateInput): AskQuoteBlock | null {
    if (!campaign.isAiEnabled) {
      return { reason: "system", message: "AI is switched off for this campaign." };
    }
    if (fiveE && !offers("stat-blocks")) {
      return { reason: "system", message: `This campaign's game system has no stat blocks, so a ${noun} cannot be made here.` };
    }
    if (quota && !quota.canCreate.value) {
      return { reason: "quota", message: `You have reached your limit of ${noun}s on this plan.` };
    }
    // A price not known yet is no block: the quote waits for it instead of guessing.
    if (total !== null && !affordable(total, byok)) {
      return { reason: "credits", message: `This costs ${total} credits and your balance is short.` };
    }
    return null;
  }

  return { blockFor };
}
