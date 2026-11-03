import { shallowRef, watch } from "vue";
import type { DungeonMap } from "@/types/dungeonMap.types";

/**
 * The map a `MapWorkbench` is handed to start from (#1125).
 *
 * The workbench re-applies its `map` prop to its own state whenever the prop
 * changes, and clears the canvas to blank when it becomes null. An editor that
 * autosaves refetches the very row it is editing after every save, and a first
 * save creates a row the editor already holds; passing the live query result
 * straight through would overwrite strokes made since the save started. So the
 * seed only moves when the editor is genuinely pointed at another map:
 *
 * - a refetch of the row it already holds is ignored,
 * - a map that has not loaded yet (or was removed) never blanks the canvas,
 * - the row this editor created itself (`skipId`) is not a new map to load,
 * - `scope` (the place or map being edited) changing starts again from nothing.
 */
export function useSeededMap(options: {
  source: () => DungeonMap | null | undefined;
  scope: () => string;
  skipId: () => string | null;
}) {
  const { source, scope, skipId } = options;
  const seed = shallowRef<DungeonMap | null>(null);

  watch(scope, () => { seed.value = null; });
  watch(
    source,
    (map) => {
      if (!map) return;
      if (seed.value?.id === map.id) return;
      if (map.id === skipId()) return;
      seed.value = map;
    },
    { immediate: true },
  );

  return seed;
}
