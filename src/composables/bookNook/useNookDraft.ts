import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import { StaleNookError, useBookNook, useSaveBookNook } from "@/composables/bookNook/useBookNooks";
import { applyOp, type StudioOp } from "@/lib/bookNook/edit";
import type { Scene } from "@/lib/bookNook/scene";

interface Draft {
  title: string;
  scene: Scene | null;
}

const sameDraft = (a: Draft, b: Draft) => a.title === b.title && JSON.stringify(a.scene) === JSON.stringify(b.scene);

/**
 * The studio's working copy of one nook: the scene and title being edited, saved by `useAutosave` against the
 * revision last read. When another tab saved first the save is refused (`StaleNookError`): autosave pauses with
 * the draft kept, and `reload()` takes the saved copy in its place. Edits go through `apply` (a `StudioOp`) or
 * `update` (any pure scene function); both throw what the edit throws, for the caller to say in words.
 */
export function useNookDraft(nookId: MaybeRefOrGetter<string>) {
  const query = useBookNook(computed(() => toValue(nookId) || null));
  const saver = useSaveBookNook();
  const draft = reactive<Draft>({ title: "", scene: null });
  const rev = ref(0);
  const stale = ref(false);
  const hydrated = ref(false);

  const autosave = useAutosave<Draft>({
    draft,
    initial: () => ({ title: "", scene: null }),
    equal: sameDraft,
    // An empty title or a nook not yet read is not saved over the real one; a stale one waits for a reload.
    canSave: () => !stale.value && draft.scene !== null && draft.title.trim() !== "",
    async save(snapshot) {
      if (!snapshot.scene) throw new Error("the studio tried to save a nook it has not read");
      try {
        const row = await saver.mutateAsync({
          id: toValue(nookId),
          rev: rev.value,
          update: { title: snapshot.title.trim(), scene: snapshot.scene },
        });
        rev.value = row.rev;
      } catch (error) {
        if (error instanceof StaleNookError) stale.value = true;
        throw error;
      }
    },
    errorMessage: "Could not save this nook",
  });

  function adopt(next: { title: string; scene: Scene; rev: number }) {
    rev.value = next.rev;
    stale.value = false;
    autosave.reset({ title: next.title, scene: next.scene });
  }

  watch(
    query.data,
    (nook) => {
      if (!nook) return;
      if (!hydrated.value) {
        hydrated.value = true;
        adopt(nook);
        return;
      }
      // Our own save's echo carries our own revision; anything newer is another tab's. A save in flight
      // moves `rev` itself when it lands, so it is not judged until it has.
      if (nook.rev <= rev.value || autosave.saving.value) return;
      if (autosave.dirty.value) stale.value = true;
      else adopt(nook);
    },
    { immediate: true },
  );

  function update(change: (scene: Scene) => Scene) {
    if (!draft.scene) throw new Error("the studio edited a nook it has not read");
    draft.scene = change(draft.scene);
  }

  function apply(op: StudioOp) {
    update((scene) => applyOp(scene, op));
  }

  /**
   * Saves the still after the scene: autosave flushes first so the still is of what was saved, and the still's
   * own save carries the revision forward, so the next autosave is not mistaken for another tab's.
   */
  async function setStill(url: string) {
    await autosave.saveNow();
    if (stale.value) throw new StaleNookError(toValue(nookId));
    const row = await saver.mutateAsync({ id: toValue(nookId), rev: rev.value, update: { still_url: url } });
    rev.value = row.rev;
  }

  /** Throws away what is on screen for the copy that was saved elsewhere. */
  async function reload() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("the nook could not be read again");
    adopt(result.data);
  }

  return {
    draft,
    loading: query.isPending,
    loadError: query.error,
    ready: computed(() => hydrated.value && draft.scene !== null),
    status: autosave.status,
    saveError: autosave.saveError,
    stale,
    apply,
    update,
    reload,
    flush: autosave.saveNow,
    setStill,
  };
}
