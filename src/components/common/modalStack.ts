import { onScopeDispose, ref, watch, type Ref } from "vue";

/**
 * Which modal is painted on top.
 *
 * `AppModal` teleports to `body`, and a `Teleport`'s anchor is placed when the
 * *component* mounts rather than when it opens — so under one flat z-index the
 * painting order is decided by the order the modals happen to be written in a
 * template. That is wrong for the case that matters: a picker opened from
 * inside a dialog is usually declared *before* it (`ArtPickerModal` sits above
 * `CoverPageInspector`'s own overlay in the same file), which would paint the
 * picker behind the thing that opened it.
 *
 * So a level is claimed on open and released on close, and the z-index follows.
 * Stacking then agrees with the hotkey layer, which already resolves Escape by
 * "most recently opened wins" — one rule for both, rather than the eye and the
 * keyboard disagreeing about which dialog is in front.
 */

/** Where the modal layer starts. Matches the `z-200` this replaced. */
const BASE_Z = 200;

/** Levels currently held, in claim order. Module scope: one stack per page. */
const held = ref<number[]>([]);

/**
 * The z-index for one modal, or `null` while it is closed — nothing is painted
 * then, and holding a level would push the next modal needlessly high.
 *
 * `flush: "sync"` so the level is claimed in the same tick the modal opens: a
 * modal that claimed a tick late would paint one frame underneath whatever it
 * was opened over.
 */
export function useModalStack(isOpen: () => boolean): Ref<number | null> {
  const zIndex = ref<number | null>(null);
  let mine: number | null = null;

  function release(): void {
    if (mine === null) return;
    const level = mine;
    mine = null;
    held.value = held.value.filter((d) => d !== level);
    zIndex.value = null;
  }

  watch(
    isOpen,
    (open) => {
      if (!open) {
        release();
        return;
      }
      if (mine !== null) return;
      mine = held.value.length === 0 ? 0 : Math.max(...held.value) + 1;
      held.value = [...held.value, mine];
      zIndex.value = BASE_Z + mine;
    },
    { immediate: true, flush: "sync" },
  );

  // A modal unmounted while still open must not strand its level, or every
  // later modal sits one step higher than it needs to, for ever.
  onScopeDispose(release);

  return zIndex;
}

/** Test seam — the stack is module state and outlives any one component. */
export function _resetModalStack(): void {
  held.value = [];
}
