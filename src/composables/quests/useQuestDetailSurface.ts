import { computed } from "vue";
import { useRoute } from "vue-router";
import { useUiStore } from "@/stores/ui";

export type QuestDetailSurface = "overview" | "work" | "run";

/**
 * Which of a quest's three permanent tabs — Overview, Story flow, Run — a
 * link or a bookmark names.
 *
 * The tabs are peers rendered by `QuestDetailView` all the time (epic #850);
 * this composable only resolves which one is current, from `?view=` and,
 * failing that, from whether a session is running. There is nothing left to
 * translate: every generator of a quest link writes `?view=` directly, so the
 * only two states this needs to read are the query and `ui.dmMode`.
 */
export function useQuestDetailSurface() {
  const route = useRoute();
  const ui = useUiStore();

  // A quest with no row yet has nothing to run. Kept local rather than
  // shared: `QuestDetailView` also needs it for the new-quest form branch and
  // the id it resolves, so exporting it here would just be a second name for
  // the same one-line check.
  const isNew = computed(() => route.name === "quest-new");

  /**
   * `?view=` is the only query key involved. A link that says "run this
   * quest" — `QuestChainRow`, `QuestRunOpenChains`'s siblings, the dashboard
   * widgets — picks the Run tab with it and nothing more; it never flips
   * `ui.dmMode` and starts broadcasting to the table on its own. That used to
   * be a real bug (#758): opening a chain from the dashboard silently
   * switched broadcasting on, so every NPC revealed afterwards announced
   * itself to the players with nothing connecting the two.
   *
   * With no `?view=` at all, a running session defaults to the Run tab —
   * that is where the table is standing — and everything else, including a
   * quest with no row yet, defaults to the Overview.
   */
  const view = computed<QuestDetailSurface>(() => {
    if (route.query.view === "work") return "work";
    if (route.query.view === "run") return "run";
    if (route.query.view === "overview") return "overview";
    return !isNew.value && ui.dmMode === "play" ? "run" : "overview";
  });

  const isRunning = computed(() => view.value === "run");

  return { view, isRunning };
}
