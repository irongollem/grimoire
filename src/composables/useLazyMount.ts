import { ref, watch, type Ref } from "vue";

/**
 * Defer mounting an overlay until the first time it opens, then keep it mounted.
 *
 * The overlay modals (bug report, campaign import, new campaign) are declared
 * always-mounted with a `v-model` open flag and render nothing until that flag
 * flips. Left static, their whole component tree — and everything they pull in,
 * e.g. useWorldBundle/useCampaignBackup/CalendarEditor — rides in the entry
 * chunk on every cold page load, for a dialog most sessions never open.
 *
 * Pairing this with `defineAsyncComponent` at the import site means the chunk is
 * fetched on first open instead of at boot. It returns a *latch*, not a mirror
 * of `isOpen`, on purpose: once opened the component stays mounted, so closing
 * the dialog does not discard a half-typed bug report or an in-flight import.
 *
 * @param isOpen the overlay's open flag — usually the `v-model` ref
 * @returns a ref to bind to `v-if` on the overlay
 */
export function useLazyMount(isOpen: Ref<boolean>): Ref<boolean> {
  const hasOpened = ref(false);
  watch(
    isOpen,
    (open) => {
      if (open) hasOpened.value = true;
    },
    { immediate: true },
  );
  return hasOpened;
}
