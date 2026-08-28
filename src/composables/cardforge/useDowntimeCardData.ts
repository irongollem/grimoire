import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { DowntimeActivity } from "@/types/downtime.types";
import { RISK_LABELS } from "@/data/downtimeActivities";
import { truncateCard } from "@/types/card.types";

/**
 * Normalized data for a Downtime (Interlude) activity card — design-agnostic.
 *
 * `DowntimeActivity` was shaped card-ready in Phase 1 precisely so this adapter
 * would be a read, not a refactor: `accent` + `glyph` already drive the portal's
 * procedural card face, and `artUrl` is null until real artwork exists — so the
 * Card Forge styles fall back to the same glyph face rather than a blank frame.
 */
export function useDowntimeCardData(data: MaybeRefOrGetter<DowntimeActivity>) {
  const portrait = computed(() => toValue(data).artUrl);
  const glyph = computed(() => toValue(data).glyph);
  const risk = computed(() => toValue(data).risk);

  const riskLabel = computed(() => RISK_LABELS[toValue(data).risk]);

  const typeTag = computed(() => `DOWNTIME · ${riskLabel.value.toUpperCase()}`);

  /** What the card yields, in the DM's vocabulary. */
  const rewardLabel = computed(() => {
    switch (toValue(data).rewardType) {
      case "npc":
        return "Contact";
      case "item":
        return "Item";
      case "note":
        return "Note";
      default:
        return toValue(data).rewardType;
    }
  });

  const typeLine = computed(() => `Yields a ${rewardLabel.value.toLowerCase()}`);

  const stats = computed(() => [
    { label: "RISK", value: riskLabel.value },
    { label: "YIELD", value: rewardLabel.value },
  ]);

  const metaRows = computed(() => [
    { label: "Risk", value: riskLabel.value },
    { label: "Yields", value: rewardLabel.value },
  ]);

  return {
    portrait,
    glyph,
    risk,
    riskLabel,
    rewardLabel,
    typeTag,
    typeLine,
    stats,
    metaRows,
    truncate: truncateCard,
  };
}
