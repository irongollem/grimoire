import { computed, type MaybeRefOrGetter, toValue } from "vue";

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
    return p < 0.33 ? "text-destructive" : p < 0.66 ? "text-amber-400" : "text-elven-green";
  });

  const hpBarColor = computed(() => {
    const p = hpPct.value;
    return p < 0.33 ? "bg-destructive" : p < 0.66 ? "bg-amber-400" : "bg-elven-green";
  });

  const immersiveHpLabel = computed(() => {
    const p = hpPct.value * 100;
    if (p <= 0) return "Dead";
    if (p <= 25) return "Bloodied";
    if (p <= 50) return "Wounded";
    if (p <= 75) return "Hurt";
    return "Healthy";
  });

  return { hpPct, hpColor, hpBarColor, immersiveHpLabel };
}
