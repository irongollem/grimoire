import { computed } from "vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import { useBeatOptions } from "@/composables/quests/useBeatOptions";
import { useCanonClues, type ClueKind } from "@/composables/canon/useCanonClues";
import { useScriptoriumDocuments } from "@/scriptorium/composables/useScriptorium";
import type { CanonClue } from "@/types/canon.types";

export interface ClueWhere {
  kind: ClueKind;
  /** Null while the lookup is still loading: a loading row says nothing rather than a name that is not its own. */
  name: string | null;
}

/** What a missing row reads as, once the lookup has loaded and the id is not in it. */
const GONE: Record<ClueKind, string> = { location: "A place that is gone", npc: "A person who is gone", quest_beat: "A beat that is gone", item: "An item that is gone", document: "A handout that is gone" };

/**
 * Names the place, person, beat, item or handout a clue lies at. Null for a clue lying nowhere yet. While a lookup is loading the
 * name is null (render nothing); only a loaded lookup that lacks the id falls back to the "gone" wording.
 */
export function useClueWhere() {
  const places = useAllLocations();
  const people = useNpcs();
  const beats = useBeatOptions();
  const documents = useScriptoriumDocuments();
  // Items are read by id (the vault can hold thousands), so only the ones a clue lies in are asked for.
  const clues = useCanonClues();
  const itemIds = computed(() => (clues.data.value ?? []).map((c) => c.item_id));
  const items = useItemsByIds(itemIds);
  return computed(() => {
    const lookups: Record<ClueKind, Map<string, string> | null> = {
      location: places.data.value ? new Map(places.data.value.map((p) => [p.id, p.name])) : null,
      npc: people.data.value ? new Map(people.data.value.map((p) => [p.id, p.name])) : null,
      quest_beat: beats.data.value ? new Map(beats.data.value.map((b) => [b.id, b.name])) : null,
      document: documents.data.value ? new Map(documents.data.value.map((d) => [d.id, d.title])) : null,
      // Null while the clues (which say which items to read) or the items themselves are still loading.
      item: clues.data.value && !items.isLoading.value ? new Map([...items.data.value].map(([id, item]) => [id, item.name])) : null,
    };
    return (clue: Pick<CanonClue, "location_id" | "npc_id" | "quest_beat_id"> & Partial<Pick<CanonClue, "item_id" | "document_id">>): ClueWhere | null => {
      const placed: { kind: ClueKind; id: string } | null = clue.location_id
        ? { kind: "location", id: clue.location_id }
        : clue.npc_id
          ? { kind: "npc", id: clue.npc_id }
          : clue.quest_beat_id
            ? { kind: "quest_beat", id: clue.quest_beat_id }
            : clue.item_id
              ? { kind: "item", id: clue.item_id }
              : clue.document_id
                ? { kind: "document", id: clue.document_id }
                : null;
      if (placed === null) return null;
      const names = lookups[placed.kind];
      return { kind: placed.kind, name: names === null ? null : (names.get(placed.id) ?? GONE[placed.kind]) };
    };
  });
}
