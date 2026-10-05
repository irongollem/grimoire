import { computed } from "vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import { useCardForgeStore } from "@/stores/cardForge";
import type { CardSubject } from "@/types/card.types";
import type { Npc } from "@/types/npc.types";
import type { MonsterIndexEntry } from "@/types/monster.types";
import type { ItemIndexEntry } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import type { SpellIndexEntry } from "@/types/spell.types";
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
  // The browse list reads the slim index of the active source only; the cards to
  // render or print read just the selected rows, by id.
  const { data: monstersData } = useMonsterIndex(() => ({ enabled: store.source === "monsters" }));
  const { data: itemsData } = useItemIndex(() => ({ enabled: store.source === "items" }));
  const { data: spellsData } = useSpellIndex(() => ({ enabled: store.source === "spells" }));
  const { data: selectedMonsters } = useMonstersByIds(() => [...store.selectedIds.monsters], { withArt: true });
  const { data: selectedItems } = useItemsByIds(() => [...store.selectedIds.items]);
  const { data: selectedSpells } = useSpellsByIds(() => [...store.selectedIds.spells]);

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
          (m: MonsterIndexEntry) =>
            m.name.toLowerCase().includes(q) ||
            m.monster_type.includes(q),
        )
        .map((m: MonsterIndexEntry) => ({
          id: m.id,
          name: m.name,
          sub: `${m.size} ${m.monster_type} · CR ${m.challenge_rating ?? "?"}`,
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
          (i: ItemIndexEntry) =>
            i.name.toLowerCase().includes(q) ||
            (i.item_type ?? "").toLowerCase().includes(q) ||
            i.rarity.includes(q),
        )
        .map((i: ItemIndexEntry) => ({
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
        (s: SpellIndexEntry) =>
          s.name.toLowerCase().includes(q) ||
          s.school.includes(q) ||
          (s.classes ?? []).some((c: string) => c.toLowerCase().includes(q)),
      )
      .map((s: SpellIndexEntry) => ({
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
      ...[...ids.monsters].flatMap((id) => {
        const m = selectedMonsters.value.get(id);
        return m ? [{ kind: "monster" as const, data: m }] : [];
      }),
      ...[...ids.items].flatMap((id) => {
        const i = selectedItems.value.get(id);
        return i ? [{ kind: "item" as const, data: i }] : [];
      }),
      ...[...ids.spells].flatMap((id) => {
        const s = selectedSpells.value.get(id);
        return s ? [{ kind: "spell" as const, data: s }] : [];
      }),
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
