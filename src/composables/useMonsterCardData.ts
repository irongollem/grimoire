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
import { parseSpeed } from "@/lib/movement";
import { parseDiceAvg } from "@/lib/dice";

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

  const hp = computed(() => {
    const raw = toValue(data).stat_block?.hit_points;
    if (!raw) return "—";
    const first = raw.split(" ")[0];
    if (/^\d+$/.test(first)) return first; // "75 (10d10+20)" -> "75"
    const avg = parseDiceAvg(raw); // bare dice "10d10+20" -> 75
    return avg > 0 ? String(Math.floor(avg)) : "—";
  });
  const ac = computed(() => String(toValue(data).stat_block?.armor_class ?? "—"));
  const spd = computed(() =>
    (toValue(data).stat_block?.speed ?? "—").replace(/ ft\.?/g, "'").slice(0, 6),
  );

  // HP/AC render as text; speed renders as distances + movement icons.
  const stats = computed(() => [
    { label: "HP", value: hp.value },
    { label: "AC", value: ac.value },
  ]);

  const speeds = computed(() => parseSpeed(toValue(data).stat_block?.speed));
  // false when there's no real movement (no speed, or only a 0-ft walk) → show "—"
  const hasSpeed = computed(() =>
    speeds.value.some((s) => s.mode !== "walk" || (!!s.value && s.value !== "0")),
  );

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
    if (sb.languages) rows.push({ label: "Lang.", value: sb.languages });
    if (sb.senses)
      rows.push({
        label: "Senses",
        // compact the verbose senses line: "120 ft." -> "120'", drop "passive"
        value: sb.senses
          .replace(/ ?ft\.?/g, "'")
          .replace(/passive Perception/gi, "PP"),
      });
    return rows;
  });

  const entries = computed(() => {
    const sb = toValue(data).stat_block;
    if (!sb) return [];
    const tarotMode = toValue(tarot) ?? false;
    const acts = sb.actions ?? [];
    const isMulti = (a: { name: string }) => /^multiattack/i.test(a.name);
    // signature actions (breath weapons, recharge powers) — keep these, they were
    // being sliced off after Multiattack + the first couple of basic attacks
    const isKey = (a: { name: string }) => /\b(breath|recharge)\b/i.test(a.name);
    const ordered = [
      ...acts.filter(isMulti),
      ...acts.filter((a) => isKey(a) && !isMulti(a)),
      ...(sb.special_abilities ?? []).slice(0, 2),
      ...acts.filter((a) => !isMulti(a) && !isKey(a)),
    ];
    return ordered
      .slice(0, tarotMode ? 7 : 6)
      // descriptions may be plain text or Tiptap JSON — normalize to plain text
      .map((e) => ({ ...e, description: extractTiptapText(e.description, Infinity) }));
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
    speeds,
    hasSpeed,
    abilities,
    statRows,
    entries,
    flavor,
    truncate: truncateCard,
  };
}
