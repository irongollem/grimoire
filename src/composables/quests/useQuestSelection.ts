import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHotkeys } from "@/composables/useHotkeys";

function queryString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * The quest screen's selection, which is the URL (#1183): `?beat=` a beat,
 * `?edge=` a route, `open=1` the drawer opened on the beat, `open=party` the
 * party's beat, traded for a plain `beat` + `open=1` as soon as it resolves.
 * A link, a bookmark and the back button then all say what the screen says.
 *
 * Esc deselects. Folding a wide drawer back is the drawer's own Esc (page layer,
 * which shadows this global one while it is wide), so one press folds and the
 * next deselects. Both go through the hotkey registry, which ignores text fields.
 */
export function useQuestSelection(options: {
  /** The party's beat on `thread` (null: the primary live thread); null until the runtime answers. */
  partyBeatFor: (thread: string | null) => string | null;
  /** What `partyBeatFor` reads, so an `open=party` link waits for it. */
  partyBeatSource: () => unknown;
}) {
  const route = useRoute();
  const router = useRouter();

  const selectedBeatId = computed(() => queryString(route.query.beat));
  const selectedEdgeId = computed(() => (selectedBeatId.value ? null : queryString(route.query.edge)));
  const drawerOpened = computed(() => route.query.open === "1" && !selectedEdgeId.value);

  /**
   * Replaces rather than pushes: picking a beat is not a place to go back to.
   * Keys the screen does not own (`thread`, `panel`, `focus`) ride along; the
   * retired `view`, `mode`, `overview` and `edit` are dropped.
   */
  function select(next: { beat?: string | null; edge?: string | null; open?: boolean }) {
    const { beat: _beat, edge: _edge, open: _open, view: _view, mode: _mode, overview: _overview, edit: _edit, ...rest } = route.query;
    const query: Record<string, typeof route.query[string]> = { ...rest };
    if (next.beat) query.beat = next.beat;
    else if (next.edge) query.edge = next.edge;
    if (next.open && !next.edge) query.open = "1";
    void router.replace({ query });
  }

  function setOpened(open: boolean) {
    if (selectedEdgeId.value) return;
    select({ beat: selectedBeatId.value, open });
  }

  useHotkeys(
    [{ combo: "Escape", description: "Deselect", hidden: true, handler: () => select({}) }],
    { layer: "global", enabled: () => (!!selectedBeatId.value || !!selectedEdgeId.value) && !drawerOpened.value },
  );

  watch([() => route.query.open, options.partyBeatSource], ([open]) => {
    if (open !== "party") return;
    const target = options.partyBeatFor(queryString(route.query.thread));
    if (target) select({ beat: target, open: true });
  }, { immediate: true });

  return { selectedBeatId, selectedEdgeId, drawerOpened, select, setOpened };
}
