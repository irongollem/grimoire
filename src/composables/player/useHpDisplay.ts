import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { healthWord } from "@/lib/encounters/healthWord";

/**
 * Derive a reactive HP ratio, text/bar colour classes and immersive health label
 * from values, refs or getters. A zero maximum yields a ratio of zero; other
 * ratios are not clamped.
 */
export function useHpDisplay(
  currentHp: MaybeRefOrGetter<number>,
  maxHp: MaybeRefOrGetter<number>
) {
  const hpPct = computed(() => {
    const max = toValue(maxHp);
    if (max === 0) return 0;
    return toValue(currentHp) / max;
  });

  const hpColor = computed(() => {
    const p = hpPct.value;
    return p < 0.33 ? "text-destructive" : p < 0.66 ? "text-ink-caution" : "text-elven-green";
  });

  const hpBarColor = computed(() => {
    const p = hpPct.value;
    return p < 0.33 ? "bg-destructive" : p < 0.66 ? "bg-tone-caution" : "bg-elven-green";
  });

  // hpPct is already a ratio (zero for a zero maximum), so it is read against a maximum of one.
  const immersiveHpLabel = computed(() => healthWord(hpPct.value, 1));

  return { hpPct, hpColor, hpBarColor, immersiveHpLabel };
}
