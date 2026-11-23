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

/**
 * Rows of `ai_generation_credit_costs` a quote may price: the generators' keys as production has them (23 Nov 2026).
 * A key not in this list does not compile, because `costOf` would quote it as 1 credit whatever it costs.
 */
export type QuoteCostKey =
  | "npc_text" | "monster_stat_block" | "entity_image" | "entity_cutout"
  | "item_generation" | "spell_generation" | "trap_generation" | "location_generation" | "faction_generation"
  | "puzzle_generation" | "quest_generation" | "quest_design_turn" | "roll_table_generation" | "loot_generation"
  | "encounter_generation" | "feature_generation" | "deity_generation" | "species_generation" | "background_generation"
  | "custom_class_generation" | "custom_subclass_generation" | "class_feature_generation" | "custom_rule_generation"
  | "recipe_generation" | "room_generation" | "quest_beat_generation" | "npc_relationship_suggestion"
  | "scriptorium_draft" | "music_track" | "map_style_generation" | "complication_generation"
  | "canon_premise_suggestion" | "canon_truth_suggestion" | "canon_clue_suggestion" | "canon_question_suggestion"
  | "canon_force_suggestion" | "canon_lore_suggestion";

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

/**
 * The pieces every generator's quote is built from: a text part, a picture part and the total. A generator that is
 * not in `QUOTES` builds its quote from these in its own module, so adding one never edits this file.
 */
export function useQuoteKit() {
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
  function artLine(label: string, value: string, count: number, key: QuoteCostKey = "entity_image", size: string = ART_SIZE): AskQuoteLine {
    if (imageIsByok.value) return { label, value, credits: 0 };
    if (imageProvider.value === null) return { label, value, credits: null };
    const each = imageCredits(costFor(key, size));
    return { label, value, credits: each === null ? null : each * count };
  }

  /** The lines with their total: null while any priced part has no known price yet. */
  function quoteOf(lines: AskQuoteLine[], byok: boolean): GeneratorQuote {
    let total: number | null = 0;
    for (const line of lines) {
      if (line.credits === null) { total = null; break; }
      total += line.credits;
    }
    return { lines, total, byok };
  }

  return { textLine, artLine, quoteOf, textIsByok, imageIsByok };
}

export function useGeneratorQuote() {
  const { textLine, artLine, quoteOf, textIsByok, imageIsByok } = useQuoteKit();

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
    return quoteOf(lines, byok);
  }

  return { quoteFor };
}
