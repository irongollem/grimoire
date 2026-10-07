import { computed, ref } from "vue";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { npcImageContext, monsterImageContext, itemImageContext, spellImageContext } from "@/ai/entityImageContext";
import { isUuid } from "@/lib/library/contentIdentity";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import { useFetchNpc } from "@/composables/npcs/useNpcs";
import { cardSubjectId, type CardSubject } from "@/types/card.types";

/**
 * "Paint portrait" for Card Forge previews: a card whose entity has no picture
 * can have one painted onto the entity, which also fills its token and its
 * detail page. Library (shared) monsters, spells and items are read-only, so
 * only the DM's own rows offer it; their ids are slugs, the DM's are uuids.
 */
export function useCardPortraitPainter() {
  const npc = useMissingPortrait("npc");
  // The card subject is a list row without the prose the paint prompt quotes (#999).
  const fetchNpc = useFetchNpc();
  const monster = useMissingPortrait("monster");
  const item = useMissingPortrait("item");
  const spell = useMissingPortrait("spell");

  // Any painter's flag will do for "one at a time": they share module state.
  const isPaintingAny = computed(() => npc.isPaintingAny.value);
  const cost = computed(() => npc.cost.value);
  const byok = computed(() => npc.byok.value);

  const failures = ref(new Map<string, string>());

  function hasNoArt(subject: CardSubject): boolean {
    switch (subject.kind) {
      case "npc":     return !subject.data.portrait_url;
      case "monster": return !subject.data.image_url && !subject.data.is_shared;
      case "item":    return !subject.data.image_url && isUuid(subject.data.id);
      case "spell":   return !subject.data.image_url && isUuid(subject.data.id);
      default:        return false;
    }
  }

  function paintable(subject: CardSubject): boolean {
    return npc.enabled.value && hasNoArt(subject);
  }

  function isPainting(subject: CardSubject): boolean {
    const id = cardSubjectId(subject);
    return npc.isPainting(id) || monster.isPainting(id) || item.isPainting(id) || spell.isPainting(id);
  }

  function errorFor(subject: CardSubject): string | null {
    return failures.value.get(cardSubjectId(subject)) ?? null;
  }

  async function paint(subject: CardSubject): Promise<void> {
    const id = cardSubjectId(subject);
    const next = new Map(failures.value);
    next.delete(id);
    failures.value = next;

    let url: string | null = null;
    let failure: string | null = null;
    switch (subject.kind) {
      case "npc":
        try {
          url = await npc.paint(id, npcImageContext(await fetchNpc(id)));
          failure = npc.error.value;
        } catch (error) {
          failure = error instanceof Error ? error.message : "Could not read this NPC.";
        }
        break;
      case "monster":
        url = await monster.paint(id, monsterImageContext(subject.data));
        failure = monster.error.value;
        break;
      case "item":
        url = await item.paint(
          id,
          itemImageContext(subject.data, {
            type: ITEM_TYPE_LABELS[subject.data.item_type],
            rarity: ITEM_RARITY_LABELS[subject.data.rarity],
          }),
        );
        failure = item.error.value;
        break;
      case "spell":
        url = await spell.paint(id, spellImageContext(subject.data));
        failure = spell.error.value;
        break;
      default:
        return;
    }
    if (!url && failure) {
      const withFailure = new Map(failures.value);
      withFailure.set(id, failure);
      failures.value = withFailure;
    }
  }

  return { paintable, paint, isPainting, isPaintingAny, cost, byok, errorFor };
}
