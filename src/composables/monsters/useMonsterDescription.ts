import { computed } from "vue";
import { useLibraryMonsterDescription } from "@/composables/monsters/useMonsters";
import type { Monster } from "@/types/monster.types";

/**
 * The lore a monster sheet shows. A DM's own monster carries it on the row; a
 * library creature does not (`LIBRARY_MONSTER_COLUMNS` leaves it out of every
 * library read), so it is read for the one creature on screen. Both sheets,
 * desktop and phone, go through this so neither can drift back to reading
 * `monster.description` and silently showing nothing for library creatures.
 */
export function useMonsterDescription(monster: () => Monster) {
  const { data: libraryDescription } = useLibraryMonsterDescription(
    () => (monster().is_shared ? monster().id : null),
  );
  return computed(() => (monster().is_shared ? libraryDescription.value : monster().description));
}
