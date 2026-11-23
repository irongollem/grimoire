/**
 * The pieces every generator's quote is built from, in the lines the quote card shows (#1253).
 *
 * The generator's own panel and Ask Grimoire both read their price from a generator's quote composable
 * (`quotes/<id>Quote.ts`, built from `useQuoteKit`), so the page and the panel cannot disagree: a price written twice
 * is the one that drifts.
 *
 * Keys are checked at compile time (`QuoteCostKey`) because `costOf` answers 1 for a key the table does not have, which
 * reads as a price and is not one. Each key a quote uses is one the server charges for that part.
 */
import type { AskQuoteLine } from "@/lib/ask/askAdapter";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

/**
 * Rows of `ai_generation_credit_costs` a quote may price: the generators' keys as production has them (23 Nov 2026), plus
 * `canon_secret_suggestion` and `canon_read_through` (#1255 item 7), which need their migration before they are charged.
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
  | "canon_force_suggestion" | "canon_lore_suggestion" | "canon_secret_suggestion" | "canon_read_through";

/** The picture size both entity pictures render at (`PURPOSES` in useImageGeneration). */
const ART_SIZE = "1024x1536";

export interface GeneratorQuote {
  lines: AskQuoteLine[];
  /** Null while any part that will be charged has no known price yet. */
  total: number | null;
  /** Every part in play runs on the DM's own key: nothing is charged. */
  byok: boolean;
}

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
