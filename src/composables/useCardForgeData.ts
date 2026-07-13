import { computed } from "vue";
import { useNpcs } from "@/composables/useNpcs";
import { useAllMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useAllSpells } from "@/composables/useSpells";
import { useCardForgeStore } from "@/stores/cardForge";
import type { CardSubject } from "@/types/card.types";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import type { Spell } from "@/types/spell.types";
import { spellLevelLabel } from "@/types/spell.types";
import { DOWNTIME_ACTIVITIES, RISK_LABELS, getDowntimeActivity } from "@/data/downtimeActivities";
import { DOWNTIME_SEEDS } from "@/data/downtimeSeeds";
import type { DowntimeActivity, DowntimeSeed } from "@/types/downtime.types";

export interface CardForgeListItem {
  id: string;
  name: string;
  sub: string;
}

export function useCardForgeData() {
  const store = useCardForgeStore();
  const { data: npcsData } = useNpcs();
  const { data: monstersData } = useAllMonsters();
  const { data: itemsData } = useItems();
  const { data: spellsData } = useAllSpells();

  const filteredList = computed<CardForgeListItem[]>(() => {
    const q = store.search.trim().toLowerCase();
    if (store.source === "npcs") {
      return (npcsData.value ?? [])
        .filter(
          (n: Npc) =>
            n.name.toLowerCase().includes(q) ||
            (n.occupation ?? "").toLowerCase().includes(q) ||
            (n.race ?? "").toLowerCase().includes(q),
        )
        .map((n: Npc) => ({
          id: n.id,
          name: n.name,
          sub: [n.race, n.occupation].filter(Boolean).join(" · "),
        }));
    }
    if (store.source === "monsters") {
      return (monstersData.value ?? [])
        .filter(
          (m: Monster) =>
            m.name.toLowerCase().includes(q) ||
            m.monster_type.includes(q) ||
            (m.habitat ?? "").toLowerCase().includes(q),
        )
        .map((m: Monster) => ({
          id: m.id,
          name: m.name,
          sub: `${m.size} ${m.monster_type} · CR ${m.stat_block?.challenge_rating ?? "?"}`,
        }));
    }
    if (store.source === "downtime") {
      // Static catalogs, not queries — the deck ships in code. The list holds
      // BOTH halves: the archetype cards (the menu a player lays down) and every
      // outcome card (the face-down stack the DM draws from). Searching an
      // archetype name — "carouse" — surfaces the activity card and all of its
      // outcomes together, which is exactly the stack you want to print.
      const activities: CardForgeListItem[] = DOWNTIME_ACTIVITIES.filter(
        (a: DowntimeActivity) =>
          a.title.toLowerCase().includes(q) || a.hook.toLowerCase().includes(q),
      ).map((a: DowntimeActivity) => ({
        id: a.key,
        name: a.title,
        sub: `Activity card · ${RISK_LABELS[a.risk]} · yields ${a.rewardType}`,
      }));

      const seeds: CardForgeListItem[] = DOWNTIME_SEEDS.filter((s: DowntimeSeed) => {
        const activityTitle = getDowntimeActivity(s.activityKey)?.title ?? "";
        return (
          s.title.toLowerCase().includes(q) ||
          s.vignette.toLowerCase().includes(q) ||
          s.activityKey.toLowerCase().includes(q) ||
          activityTitle.toLowerCase().includes(q)
        );
      }).map((s: DowntimeSeed) => ({
        id: s.id,
        name: s.title,
        sub: `${getDowntimeActivity(s.activityKey)?.title ?? "???"} · outcome`,
      }));

      return [...activities, ...seeds];
    }
    if (store.source === "items") {
      return (itemsData.value ?? [])
        .filter(
          (i: Item) =>
            i.name.toLowerCase().includes(q) ||
            (i.item_type ?? "").toLowerCase().includes(q) ||
            i.rarity.includes(q),
        )
        .map((i: Item) => ({
          id: i.id,
          name: i.name,
          sub: [
            ITEM_RARITY_LABELS[i.rarity],
            ITEM_TYPE_LABELS[i.item_type],
            i.subtype,
          ]
            .filter(Boolean)
            .join(" · "),
        }));
    }
    return (spellsData.value ?? [])
      .filter(
        (s: Spell) =>
          s.name.toLowerCase().includes(q) ||
          s.school.includes(q) ||
          (s.classes ?? []).some((c: string) => c.toLowerCase().includes(q)),
      )
      .map((s: Spell) => ({
        id: s.id,
        name: s.name,
        sub: `${spellLevelLabel(s.level)} · ${s.school}`,
      }));
  });

  const selectedSubjects = computed<CardSubject[]>(() => {
    const ids = store.selectedIds;
    return [
      ...(npcsData.value ?? [])
        .filter((n: Npc) => ids.npcs.has(n.id))
        .map((n: Npc) => ({ kind: "npc" as const, data: n })),
      ...(monstersData.value ?? [])
        .filter((m: Monster) => ids.monsters.has(m.id))
        .map((m: Monster) => ({ kind: "monster" as const, data: m })),
      ...(itemsData.value ?? [])
        .filter((i: Item) => ids.items.has(i.id))
        .map((i: Item) => ({ kind: "item" as const, data: i })),
      ...(spellsData.value ?? [])
        .filter((s: Spell) => ids.spells.has(s.id))
        .map((s: Spell) => ({ kind: "spell" as const, data: s })),
      // Activity cards are keyed by `key`, not `id` — see `cardSubjectId`.
      ...DOWNTIME_ACTIVITIES.filter((a: DowntimeActivity) =>
        ids.downtime.has(a.key),
      ).map((a: DowntimeActivity) => ({ kind: "downtime" as const, data: a })),
      // Outcome cards share the same bucket. Activity keys ("carouse") and seed
      // ids ("carouse-fence") never collide, so one set of ids serves both.
      ...DOWNTIME_SEEDS.filter((s: DowntimeSeed) => ids.downtime.has(s.id)).map(
        (s: DowntimeSeed) => ({ kind: "downtime-seed" as const, data: s }),
      ),
    ];
  });

  return { filteredList, selectedSubjects };
}
