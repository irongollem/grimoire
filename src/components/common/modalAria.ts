import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

/**
 * How a modal learns the ids of the elements that name and describe it.
 *
 * `AppModal` needs `aria-labelledby`/`aria-describedby` pointing at real
 * elements, but those elements live in its slot — the caller's markup — so the
 * shell cannot see them. Passing the ids down by hand works and is still
 * supported, but it is a step a call site can simply forget, and a dialog with
 * no accessible name fails silently: everything looks right on screen and a
 * screen reader announces "dialog" with no idea what it is.
 *
 * So `ModalHeader` registers its own ids upward instead. Drop one into a modal
 * and the wiring is correct because it happened automatically, not because
 * someone remembered — which is the only version of this that survives 50 call
 * sites.
 */
export interface ModalAria {
  /** Id of the element naming the dialog — the header's heading. */
  labelledBy: Ref<string | null>;
  /** Id of the element describing it — the header's subtitle, where there is one. */
  describedBy: Ref<string | null>;
}

export const MODAL_ARIA: InjectionKey<ModalAria> = Symbol("modal-aria");

/** Called by the shell. The returned refs follow whatever its header registers. */
export function provideModalAria(): ModalAria {
  const aria: ModalAria = { labelledBy: ref(null), describedBy: ref(null) };
  provide(MODAL_ARIA, aria);
  return aria;
}

/**
 * Called by a header. Returns null when it is used outside a modal — a header
 * is a plain heading block in that case, and must not throw for it.
 */
export function useModalAria(): ModalAria | null {
  return inject(MODAL_ARIA, null);
}
