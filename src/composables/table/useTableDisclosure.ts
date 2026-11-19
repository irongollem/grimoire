import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";

/**
 * Which accounts have been told, on this device, that the Dungeon Master is an AI (AI Act, Article 50; Disclosure
 * frame 07). A per-viewer convenience kept in the browser, so it is shown the first time an account sits down and
 * not on every visit; the standing mark in the bar never hides and reopens it. If storage is blocked it is shown
 * again on a reload, which is the safe direction to fail.
 */
const told = useStorage<string[]>("grimoire:ai-table-disclosed", [], safeLocalStorage());

export function useTableDisclosure() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  // Asked for again from the mark in the bar, whether or not this account has been told before.
  const reopened = ref(false);

  const open = computed(() => reopened.value || (userId.value !== null && !told.value.includes(userId.value)));

  function accept(): void {
    const id = userId.value;
    if (id !== null && !told.value.includes(id)) told.value = [...told.value, id];
    reopened.value = false;
  }

  function reopen(): void {
    reopened.value = true;
  }

  /** "Not now" before ever being told closes nothing: the caller leaves the table. Afterwards it just closes. */
  function dismiss(): void {
    reopened.value = false;
  }

  return { open, accept, reopen, dismiss, hasBeenTold: computed(() => userId.value !== null && told.value.includes(userId.value)) };
}
