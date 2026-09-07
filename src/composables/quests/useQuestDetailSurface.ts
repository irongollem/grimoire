import { computed } from "vue";
import { useRoute } from "vue-router";
import { useUiStore } from "@/stores/ui";

export type QuestDetailSurface = "overview" | "work";

/**
 * Resolves which surface a quest's detail route is showing, and whether that
 * surface is a commitment big enough to take the whole screen.
 *
 * Pulled out of `QuestDetailView` so it and `QuestsView` cannot disagree about
 * the answer. The list needs it too: `/quests/:id` nests under `/quests` the
 * same way an NPC's sheet nests under the grid, but a quest has two detail
 * surfaces rather than one, and only the overview is a glance. The graph
 * designer is a fixed-viewport canvas and the run cockpit is a live session —
 * neither belongs behind a backdrop that a stray click dismisses — so
 * `takesWholeScreen` is what `useDetailModal` needs from this module to keep
 * those two off the popover it would otherwise offer.
 */
export function useQuestDetailSurface() {
  const route = useRoute();
  const ui = useUiStore();

  // A quest with no row yet has nothing to run. Kept local rather than shared:
  // `QuestDetailView` also needs it for the new-quest form branch and the id
  // it resolves, so exporting it here would just be a second name for the
  // same one-line check.
  const isNew = computed(() => route.name === "quest-new");

  // The id `ui.questFullScreenId` is compared against. Read straight off the
  // route rather than threaded in as a parameter: `QuestDetailView` resolves
  // it the same way for its own `useQuest` lookup, and a quest with no row yet
  // never reaches `takesWholeScreen`'s flag branch anyway.
  const questId = computed(() => route.params.id as string | undefined);

  /**
   * The cockpit is showing — either because the link asked for it, or because a
   * session is running and the cockpit is the session's default surface.
   *
   * `?mode=run` is *not* a legacy bookmark: `QuestChainRow` and
   * `QuestRunOpenChains` generate it every time a DM opens a chain. It used to be
   * honoured by writing `ui.dmMode = "play"` and then stripping itself from the
   * query — so opening a chain from the dashboard silently switched broadcasting
   * on, and every NPC revealed afterwards announced itself to the players with
   * nothing to connect the two. A link that says "run this quest" may choose the
   * surface; it may not start broadcasting to the table. See #758.
   */
  const runRequested = computed(() => route.query.mode === "run");
  const isRunning = computed(() => !isNew.value && (runRequested.value || ui.dmMode === "play"));

  /**
   * Prep opens on the overview and Play opens on the cockpit. Preparing a quest
   * starts from its premise; running one starts from where the party is standing.
   * `?overview=true` and `?mode=details` are the links the drawer left behind —
   * across saved bookmarks, attachment adapters and return-to paths — and they
   * still mean the same surface.
   */
  const view = computed<QuestDetailSurface>(() => {
    if (route.query.view === "overview" || route.query.overview === "true" || route.query.mode === "details") return "overview";
    if (route.query.view === "work") return "work";
    return isRunning.value ? "work" : "overview";
  });

  /**
   * The graph designer and the run cockpit are always a commitment. The
   * overview joins them only when the DM reached it by switching *away* from
   * one of those two with the in-quest `SegmentedControl` — tracked by
   * `ui.questFullScreenId`, which `QuestDetailView.selectView` sets to this
   * quest's id on exactly that switch and clears on leaving the quest.
   * Without this, clicking "Overview" from the run cockpit or story flow
   * dropped the DM onto the quest list with a modal open over it — a surface
   * switch made *inside* a quest, which must never look like new navigation to
   * one the DM never asked to see.
   */
  const takesWholeScreen = computed(() =>
    view.value === "work" || (questId.value !== undefined && ui.questFullScreenId === questId.value),
  );

  return { view, isRunning, takesWholeScreen };
}
