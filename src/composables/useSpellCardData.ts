import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Spell } from "@/types/spell.types";
import { spellLevelLabel } from "@/types/spell.types";
import { truncateCard } from "@/types/card.types";
import { damageTypesFromRolls } from "@/lib/damageIcons";

/**
 * Normalized data for a Spell card — design-agnostic.
 */
export function useSpellCardData(data: MaybeRefOrGetter<Spell>) {
  const portrait = computed(() => toValue(data).image_url ?? null);
  const school = computed(() => toValue(data).school);

  const levelLabel = computed(() =>
    toValue(data).level === 0 ? "Cantrip" : "L" + toValue(data).level,
  );

  const typeLine = computed(
    () => spellLevelLabel(toValue(data).level) + " · " + toValue(data).school,
  );

  /** Compact strings for the front stats strip */
  const castStat = computed(() =>
    toValue(data)
      .casting_time.replace("Bonus Action", "BA")
      .replace("Action", "Act")
      .slice(0, 6),
  );
  const rangeStat = computed(() =>
    toValue(data).range.replace(" ft.", "'").slice(0, 6),
  );
  const durStat = computed(() =>
    toValue(data)
      .duration.replace("Concentration, up to ", "C/")
      .replace(" minutes", "m")
      .replace(" minute", "m")
      .replace(" hours", "h")
      .replace(" hour", "h")
      .slice(0, 8),
  );

  const stats = computed(() => [
    { label: "CAST", value: castStat.value },
    { label: "RNG", value: rangeStat.value },
    { label: "DUR", value: durStat.value },
  ]);

  const damageTypes = computed(() =>
    damageTypesFromRolls(toValue(data).damage_rolls),
  );

  const metaRows = computed(() => {
    const d = toValue(data);
    return [
      { label: "Casting", value: d.casting_time },
      { label: "Range", value: d.range },
      { label: "Duration", value: d.duration },
      {
        label: "Comps",
        value:
          d.components.join(", ") +
          (d.material ? " — " + truncateCard(d.material, 40) : ""),
      },
      { label: "Classes", value: d.classes.join(", ") },
      { label: "Level", value: spellLevelLabel(d.level) },
    ];
  });

  return {
    portrait,
    school,
    levelLabel,
    typeLine,
    castStat,
    rangeStat,
    durStat,
    stats,
    metaRows,
    damageTypes,
    truncate: truncateCard,
  };
}
