import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Monster } from "@/types/monster.types";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  capitalize,
  truncateCard,
} from "@/types/card.types";
import { extractTiptapText } from "@/lib/utils";
import { parseDamageGroups, type DamageGroup } from "@/lib/damageIcons";

/** A stat row; damage rows carry parsed groups so the UI can render icons. */
export interface CardStatRow {
  label: string;
  value: string;
  damage?: DamageGroup[];
}

/**
 * Build a damage stat row: icon groups when types are recognized, plain text
 * otherwise, and nothing for empty/junk values (e.g. a stray "[]").
 */
function damageRow(label: string, raw: string | undefined): CardStatRow | null {
  if (!raw) return null;
  const groups = parseDamageGroups(raw);
  if (groups.length) return { label, value: raw, damage: groups };
  const value = raw.trim();
  if (!value || value === "[]") return null;
  return { label, value };
}

/**
 * Normalized data for a Monster card — design-agnostic.
 */
export function useMonsterCardData(
  data: MaybeRefOrGetter<Monster>,
  tarot: MaybeRefOrGetter<boolean | undefined> = false,
) {
  const portrait = computed(() => toValue(data).image_url ?? null);
  const monsterType = computed(() => toValue(data).monster_type);

  const typeTag = computed(
    () => "MONSTER · " + toValue(data).monster_type.toUpperCase(),
  );
  const typeLine = computed(
    () =>
      toValue(data).size +
      " " +
      toValue(data).monster_type +
      " · " +
      toValue(data).alignment,
  );

  const badge = computed(() => {
    const cr = toValue(data).stat_block?.challenge_rating;
    return cr !== null && cr !== undefined ? "CR " + cr : null;
  });

  const hp = computed(
    () => toValue(data).stat_block?.hit_points?.split(" ")[0] ?? "—",
  );
  const ac = computed(() => String(toValue(data).stat_block?.armor_class ?? "—"));
  const spd = computed(() =>
    (toValue(data).stat_block?.speed ?? "—").replace(/ ft\.?/g, "'").slice(0, 6),
  );

  const stats = computed(() => [
    { label: "HP", value: hp.value },
    { label: "AC", value: ac.value },
    { label: "SPD", value: spd.value },
  ]);

  const abilities = computed(() =>
    ABILITY_KEYS.map((key) => {
      const score = toValue(data).stat_block?.[key] ?? 10;
      return {
        key,
        label: ABILITY_LABELS[key],
        score,
        mod: Math.floor((score - 10) / 2),
      };
    }),
  );

  const statRows = computed((): CardStatRow[] => {
    const sb = toValue(data).stat_block;
    if (!sb) return [];
    const rows: CardStatRow[] = [];
    if (sb.saving_throws)
      rows.push({ label: "Saves", value: sb.saving_throws });
    if (sb.skills && Object.keys(sb.skills).length) {
      rows.push({
        label: "Skills",
        value: Object.entries(sb.skills)
          .map(([k, v]) => capitalize(k) + " " + v)
          .join(", "),
      });
    }
    const vuln = damageRow("Vuln.", sb.damage_vulnerabilities);
    if (vuln) rows.push(vuln);
    const resist = damageRow("Resist.", sb.damage_resistances);
    if (resist) rows.push(resist);
    const immune = damageRow("Immune", sb.damage_immunities);
    if (immune) rows.push(immune);
    if (sb.senses) rows.push({ label: "Senses", value: sb.senses });
    if (sb.languages) rows.push({ label: "Lang.", value: sb.languages });
    return rows;
  });

  const entries = computed(() => {
    const sb = toValue(data).stat_block;
    if (!sb) return [];
    const tarotMode = toValue(tarot) ?? false;
    return [
      ...(sb.special_abilities ?? []).slice(0, 2),
      ...(sb.actions ?? []).slice(0, 3),
    ].slice(0, tarotMode ? 5 : 4);
  });

  const flavor = computed(() => {
    const raw = toValue(data).notes ?? toValue(data).habitat ?? null;
    // Full text — the card UI line-clamps it to whatever space remains.
    return raw ? extractTiptapText(raw, Infinity) || null : null;
  });

  return {
    portrait,
    monsterType,
    typeTag,
    typeLine,
    badge,
    hp,
    ac,
    spd,
    stats,
    abilities,
    statRows,
    entries,
    flavor,
    truncate: truncateCard,
  };
}
