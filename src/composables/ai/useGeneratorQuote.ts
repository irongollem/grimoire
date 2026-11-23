/**
 * What one run of a generator costs, in the lines the quote card shows (#1253).
 *
 * The generator's own panel and Ask Grimoire both read their price from here, so the page and the panel cannot
 * disagree: a price written twice is the one that drifts. Each generator is one entry in `QUOTES` (its options and the
 * parts it charges for); the next generator is one more entry, not a new composable.
 *
 * Keys are checked at compile time (`QuoteCostKey`) because `costOf` answers 1 for a key the table does not have, which
 * reads as a price and is not one. Each key here is one the server charges for that part: the NPC text is
 * `generate-npc`'s `npc_text`, and every picture goes through the durable image job, which bills `entity_image`
 * (generate-chronicle-image, `PURPOSE_CONFIG`), not the `portrait` row generate-npc only uses when it paints inline.
 */
import type { AskQuoteLine } from "@/lib/ask/askAdapter";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

/** Rows of `ai_generation_credit_costs` a quote may price. Add a key with its generator, never as a loose string. */
export type QuoteCostKey = "npc_text" | "monster_stat_block" | "entity_image";

/** The picture size both entity pictures render at (`PURPOSES` in useImageGeneration). */
const ART_SIZE = "1024x1536";

export interface GeneratorQuote {
  lines: AskQuoteLine[];
  /** Null while any part that will be charged has no known price yet. */
  total: number | null;
  /** Every part in play runs on the DM's own key: nothing is charged. */
  byok: boolean;
}

/** The options that change a generator's price, by generator id. */
export interface QuoteOptions {
  npc: { portrait: boolean; alterEgo: boolean };
  monster: { image: boolean };
}
export type QuotedGenerator = keyof QuoteOptions;

export function useGeneratorQuote() {
  const { costOf } = useAiCredits();
  const { textCredits, textIsByok, imageProvider, imageCredits, imageIsByok } = useCampaignProviders();

  function costFor(key: QuoteCostKey, size?: string): number {
    return costOf(key, { size });
  }

  /** One text part: its price, or 0 on the DM's own key. Null while the provider is unknown. */
  function textLine(label: string, value: string, key: QuoteCostKey): AskQuoteLine {
    if (textIsByok.value) return { label, value, credits: 0 };
    return { label, value, credits: textCredits(costFor(key)) };
  }

  /**
   * `count` pictures. Rounded up PER picture and then multiplied, as the server charges each as its own
   * whole-credit line rather than rounding a pre-multiplied total.
   */
  function artLine(label: string, value: string, count: number): AskQuoteLine {
    if (imageIsByok.value) return { label, value, credits: 0 };
    if (imageProvider.value === null) return { label, value, credits: null };
    const each = imageCredits(costFor("entity_image", ART_SIZE));
    return { label, value, credits: each === null ? null : each * count };
  }

  const QUOTES: { [G in QuotedGenerator]: (options: QuoteOptions[G]) => { lines: AskQuoteLine[]; byok: boolean } } = {
    npc: ({ portrait, alterEgo }) => {
      const lines = [textLine("NPC text", "Written by AI", "npc_text")];
      if (portrait) {
        const count = alterEgo ? 2 : 1;
        lines.push(artLine("Portrait", count === 2 ? "Portrait and alter ego" : "Portrait", count));
      }
      return { lines, byok: textIsByok.value && (!portrait || imageIsByok.value) };
    },
    monster: ({ image }) => {
      const lines = [textLine("Stat block", "Written by AI", "monster_stat_block")];
      if (image) lines.push(artLine("Picture", "Painted by AI", 1));
      return { lines, byok: textIsByok.value && (!image || imageIsByok.value) };
    },
  };

  function quoteFor<G extends QuotedGenerator>(generator: G, options: QuoteOptions[G]): GeneratorQuote {
    const { lines, byok } = QUOTES[generator](options);
    let total: number | null = 0;
    for (const line of lines) {
      if (line.credits === null) { total = null; break; }
      total += line.credits;
    }
    return { lines, total, byok };
  }

  return { quoteFor };
}
