import { computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";

/**
 * Presents an entity's detail route as a modal over the list it belongs to.
 *
 * The detail route is nested under the list route, so both components are
 * mounted at once and this is the one place that decides which of them the user
 * is actually looking at. Both callers use the same instance of the reasoning:
 * the list asks `showList`, the detail asks `asModal`.
 *
 * Reading is a glance and editing is a commitment, so only reading gets the
 * modal. `?edit=true` and every width below `md` take the whole screen, which
 * is also why the list has to be able to get out of the way rather than always
 * rendering behind.
 *
 * @param listPath where closing lands — the list route this detail belongs to.
 */
export function useDetailModal(listPath: string) {
  const route = useRoute();
  const router = useRouter();

  // Mirrors the breakpoint the rest of the app splits on: below `md` is the
  // full-screen takeover, tablets and up get the desktop treatment.
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isEditing = computed(() => route.query.edit === "true");

  /**
   * A detail route is matched *under* the list route. Structural rather than a
   * param or name check, so a list that nests something other than `:id` — a
   * second detail child, a differently-named param — needs no change here.
   */
  const hasDetail = computed(() => route.matched.length > 1);

  /** The detail is a panel over the list, rather than a screen of its own. */
  const asModal = computed(() => hasDetail.value && !isMobile.value && !isEditing.value);

  /**
   * The list renders when it is the destination, and stays rendered behind an
   * open modal — that is what keeps scroll position and the revealed page of an
   * infinite-scrolling grid intact. It unmounts only for a detail that has
   * taken the whole screen, where drawing it would be waste behind an opaque
   * layer.
   */
  const showList = computed(() => !hasDetail.value || asModal.value);

  /**
   * `replace`, not `push` or `back`.
   *
   * Closing is undoing the navigation that opened the modal, not a new place to
   * be. `replace` says exactly that in one line for both ways in: arriving from
   * the grid it collapses back onto the grid, and arriving from a link on
   * another entity it leaves that entity as the previous entry, so Back still
   * returns there the way the entity-linking convention promises.
   *
   * The alternative — `back()` when the previous entry is the list, `push`
   * otherwise — needs to ask where the user came from, and a flag for each case
   * is two ways to be slightly wrong.
   */
  function close() {
    void router.replace(listPath);
  }

  return { asModal, showList, isEditing, isMobile, close };
}
