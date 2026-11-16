import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { entryRefKey, type EntryPicture } from "@/lib/tableQuestions/options";
import type { EntryRef } from "@/types/tableQuestion.types";

/**
 * Names and pictures for the things roll table entries point at, keyed by
 * `entryRefKey`. NPCs come from the DM's own list, so only a DM-side caller
 * passes `npcs: true`; a player never resolves one.
 */
export function useEntryPictures(
  refs: MaybeRefOrGetter<readonly EntryRef[]>,
  opts?: { npcs?: boolean },
): ComputedRef<Map<string, EntryPicture>> {
  const idsOf = (kind: EntryRef["kind"]) => computed(() => toValue(refs).filter((r) => r.kind === kind).map((r) => r.id));
  const monsterIds = idsOf("monster");
  const itemIds = idsOf("item");
  const npcIds = idsOf("npc");

  const monsters = useMonstersByIds(monsterIds, { withArt: true });
  const items = useItemsByIds(itemIds);
  const npcs = useNpcs(() => opts?.npcs === true && npcIds.value.length > 0);

  return computed(() => {
    const out = new Map<string, EntryPicture>();
    for (const id of monsterIds.value) {
      const m = monsters.data.value.get(id);
      if (m) out.set(entryRefKey({ kind: "monster", id }), { name: m.name, image_url: m.image_url, focal: m.portrait_focal_point ?? null });
    }
    for (const id of itemIds.value) {
      const item = items.data.value.get(id);
      if (item) out.set(entryRefKey({ kind: "item", id }), { name: item.name, image_url: item.image_url, focal: item.image_focal_point ?? null });
    }
    if (opts?.npcs) {
      const wanted = new Set(npcIds.value);
      for (const npc of npcs.data.value ?? []) {
        if (wanted.has(npc.id)) {
          out.set(entryRefKey({ kind: "npc", id: npc.id }), { name: npc.name, image_url: npc.portrait_url, focal: npc.portrait_focal_point ?? null });
        }
      }
    }
    return out;
  });
}
