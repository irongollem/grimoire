import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { ModalOrigin } from "@/lib/modalOrigin";
import type { DmNoteSubject } from "@/types/dmNote.types";

/**
 * UI state of the docked DM scratchpad (#983). Pages register the entity they
 * show; the panel follows the newest one unless the DM pinned a subject.
 */
export const useScratchpadStore = defineStore("scratchpad", () => {
  const open = ref(false);
  const pinned = ref<DmNoteSubject | null>(null);
  const pageSubjects = ref<DmNoteSubject[]>([]);
  const launchRect = ref<ModalOrigin | null>(null);

  const pageSubject = computed(() => pageSubjects.value[pageSubjects.value.length - 1] ?? null);
  const shown = computed(() => pinned.value ?? pageSubject.value);

  function register(subject: DmNoteSubject): () => void {
    // Its own object, so the returned remover takes out exactly this entry
    // even when two boxes register the same entity.
    const entry = { ...subject };
    pageSubjects.value.push(entry);
    return () => {
      const at = pageSubjects.value.indexOf(entry);
      if (at !== -1) pageSubjects.value.splice(at, 1);
    };
  }

  /** Like the soundboard widget: an omitted origin leaves the last one standing. */
  function toggle(origin?: ModalOrigin): void {
    if (origin) launchRect.value = origin;
    open.value = !open.value;
  }

  function pin(): void {
    const current = shown.value;
    if (current) pinned.value = { ...current };
  }

  function unpin(): void {
    pinned.value = null;
  }

  function isShowing(type: string, id: string): boolean {
    const current = shown.value;
    return open.value && current !== null && current.type === type && current.id === id;
  }

  return { open, pinned, pageSubjects, launchRect, pageSubject, shown, register, toggle, pin, unpin, isShowing };
});
