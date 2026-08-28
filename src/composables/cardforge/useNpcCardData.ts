import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Npc } from "@/types/npc.types";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  capitalize,
  truncateCard,
} from "@/types/card.types";
import { extractTiptapText } from "@/lib/utils";
import { parseDiceAvg } from "@/lib/dice/dice";
import { parseSenses, type SenseEntry } from "@/lib/senses";

/**
 * Normalized data for an NPC card — the *concept* of an NPC card,
 * independent of any visual design. Designs consume this and decide
 * how to render it.
 */
export function useNpcCardData(
  data: MaybeRefOrGetter<Npc>,
  tarot: MaybeRefOrGetter<boolean | undefined> = false,
) {
  const portrait = computed(() => toValue(data).portrait_url ?? null);
  const relationship = computed(() => toValue(data).relationship);

  const typeTag = computed(
    () => "NPC · " + toValue(data).relationship.toUpperCase(),
  );
  const typeLine = computed(() =>
    [toValue(data).race, toValue(data).occupation].filter(Boolean).join(" · "),
  );

  const hp = computed(() => {
    const raw = toValue(data).stat_block?.hit_points;
    if (!raw) return "—";
    const first = raw.split(" ")[0];
    if (/^\d+$/.test(first)) return first; // "75 (10d10+20)" -> "75"
    const avg = parseDiceAvg(raw); // bare dice "10d10+20" -> 75
    return avg > 0 ? String(Math.floor(avg)) : "—";
  });
  const ac = computed(() => String(toValue(data).stat_block?.armor_class ?? "—"));
  const cha = computed(() => String(toValue(data).stat_block?.cha ?? "—"));

  const stats = computed(() => [
    { label: "HP", value: hp.value },
    { label: "AC", value: ac.value },
    { label: "CHA", value: cha.value },
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

  const statRows = computed(() => {
    const sb = toValue(data).stat_block;
    if (!sb) return [];
    const rows: Array<{ label: string; value: string; senses?: SenseEntry[] }> = [];
    if (sb.skills && Object.keys(sb.skills).length) {
      rows.push({
        label: "Skills",
        value: Object.entries(sb.skills)
          .map(([k, v]) => capitalize(k) + " " + v)
          .join(", "),
      });
    }
    if (sb.languages) rows.push({ label: "Lang.", value: sb.languages });
    if (sb.senses)
      rows.push({ label: "Senses", value: sb.senses, senses: parseSenses(sb.senses) });
    return rows;
  });

  const entries = computed(() => {
    const sb = toValue(data).stat_block;
    if (!sb) return [];
    const tarotMode = toValue(tarot) ?? false;
    return [
      ...(sb.special_abilities ?? []).slice(0, 2),
      ...(sb.actions ?? []).slice(0, 2),
    ]
      .slice(0, tarotMode ? 5 : 4)
      // descriptions may be plain text or Tiptap JSON — normalize to plain text
      .map((e) => ({ ...e, description: extractTiptapText(e.description, Infinity) }));
  });

  const flavor = computed(() => {
    const raw = toValue(data).personality ?? toValue(data).backstory ?? null;
    // Full text — the card UI line-clamps it to whatever space remains.
    return raw ? extractTiptapText(raw, Infinity) || null : null;
  });

  return {
    portrait,
    relationship,
    typeTag,
    typeLine,
    hp,
    ac,
    cha,
    stats,
    abilities,
    statRows,
    entries,
    flavor,
    truncate: truncateCard,
  };
}
