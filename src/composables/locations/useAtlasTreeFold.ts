import { computed, ref, watch, type Ref } from "vue";
import { useUiStore } from "@/stores/ui";

/**
 * Whether the Atlas tree column is on screen, which has three inputs that used
 * to share one stored flag.
 *
 * 1. **The DM's own fold**, `ui.locationsTreeCollapsed`. Stored, and written
 *    only by the two chevrons.
 * 2. **A pane that wants the width**: a site's Map tab, or a site being run.
 *    This is derived from where the DM is and is never stored. It used to be
 *    written into the stored flag with a "restore what I folded" note kept in
 *    component memory, so a reload in either state (a deploy, a closed tab)
 *    lost the note and left the tree folded for good. The DM can still reopen
 *    the tree beside such a pane; that choice lasts until the pane stops asking.
 * 3. **Search results.** They render in the tree column, so a search typed
 *    while the column is away (folded on desktop, swapped for the place pane
 *    on a phone) had nowhere to appear and read as a search that does nothing
 *    (2 Oct 2026). Changing a filter opens the results; picking one, or
 *    clearing the filters, puts the layout back the way it was.
 */
export function useAtlasTreeFold(paneWantsWidth: Readonly<Ref<boolean>>) {
  const ui = useUiStore();

  const reopenedBesidePane = ref(false);
  watch(paneWantsWidth, (wants) => {
    if (!wants) reopenedBesidePane.value = false;
  });

  // Not immediate: the filters outlive the page (Filter State Pattern), and a
  // search left over from an earlier visit should not take over the screen on
  // arrival. Only a change made here opens the results.
  const resultsOpen = ref(false);
  watch(
    () => [ui.locationsSearch, ui.locationsFilterType],
    () => {
      resultsOpen.value = ui.locationsHasActiveFilters;
    },
  );

  const treeFolded = computed(() => {
    if (resultsOpen.value) return false;
    return paneWantsWidth.value ? !reopenedBesidePane.value : ui.locationsTreeCollapsed;
  });

  function foldTree() {
    resultsOpen.value = false;
    if (paneWantsWidth.value) reopenedBesidePane.value = false;
    else ui.locationsTreeCollapsed = true;
  }

  function unfoldTree() {
    if (paneWantsWidth.value) reopenedBesidePane.value = true;
    else ui.locationsTreeCollapsed = false;
  }

  function closeResults() {
    resultsOpen.value = false;
  }

  return { treeFolded, resultsOpen, foldTree, unfoldTree, closeResults };
}
