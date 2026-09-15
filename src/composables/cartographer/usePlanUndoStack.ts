// The Plan layer's own undo stack (epic #884 S7b).
//
// The Drawing undoes through `CommandStack` (`src/cartographer/commandStack.ts`)
// — a plain in-memory snapshot diff, since a Drawing edit only ever touches
// the `layers`/`metadata` refs MapWorkbench already owns locally and nothing
// is written until Save. The Plan is different on purpose (#868, frame 01:
// "a DM edit always wins over the next re-publish"): every trace, claim or
// door action writes straight to `location_map_regions`/`location_doors` as
// it happens, so there is no local draft to snapshot. Undo here instead
// replays the INVERSE of whichever mutation ran — delete what was created,
// restore what was overwritten, recreate what was deleted — the same
// "session undo stack of inverse mutations" the story spec asks for.
//
// Deliberately session-only and deliberately narrow: nothing here persists
// past a page reload (there is no server-side undo log), and an action whose
// inverse can't be expressed faithfully must not be pushed at all — see
// `usePlanPalette.ts`'s own comment on why CREATE's redo needs a mutable
// id handle rather than a plain string.
//
// A rejected inverse mutation is toasted HERE, not by the mutation composable
// it calls (#884 review finding 3) — `usePlanPalette.ts`'s undo/redo closures
// call `mutateAsync` directly, which has no `onError` of its own to toast
// from, so without this a stale row, an RLS denial or a dropped connection
// made Ctrl+Z do nothing, repeatedly, with no feedback at all.

import { ref } from "vue";
import { useToast } from "@/composables/useToast";

export interface PlanUndoEntry {
  /** Debugging/tests only — never shown in the UI (the toolbar's Undo/Redo
   *  buttons are the same unlabelled icons the Drawing already uses). */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export function usePlanUndoStack() {
  const { error: toastError, fromError } = useToast();

  const past: PlanUndoEntry[] = [];
  const future: PlanUndoEntry[] = [];
  // Plain counters, not the arrays themselves, so Vue only re-renders on a
  // push/undo/redo rather than deep-watching two arrays of closures every
  // paint frame — the same "cheap reactive signal over a plain structure"
  // shape `CommandStack`'s own `canUndo`/`canRedo` refs already use.
  const canUndo = ref(false);
  const canRedo = ref(false);
  const busy = ref(false);

  function sync(): void {
    canUndo.value = past.length > 0;
    canRedo.value = future.length > 0;
  }

  function push(entry: PlanUndoEntry): void {
    past.push(entry);
    future.length = 0;
    sync();
  }

  async function undo(): Promise<void> {
    if (busy.value) return;
    const entry = past.pop();
    if (!entry) return;
    busy.value = true;
    try {
      await entry.undo();
      future.push(entry);
    } catch (err) {
      // The closures in `usePlanPalette.ts` call `mutateAsync` directly, so
      // nothing else toasts this — do it here, and put the entry back so a
      // retry (another Ctrl+Z) can try again rather than the stack silently
      // going dead.
      toastError(fromError(err, "Couldn't undo that — try again."));
      past.push(entry);
    } finally {
      busy.value = false;
      sync();
    }
  }

  async function redo(): Promise<void> {
    if (busy.value) return;
    const entry = future.pop();
    if (!entry) return;
    busy.value = true;
    try {
      await entry.redo();
      past.push(entry);
    } catch (err) {
      toastError(fromError(err, "Couldn't redo that — try again."));
      future.push(entry);
    } finally {
      busy.value = false;
      sync();
    }
  }

  function clear(): void {
    past.length = 0;
    future.length = 0;
    sync();
  }

  return { push, undo, redo, clear, canUndo, canRedo, busy };
}

export type UsePlanUndoStackReturn = ReturnType<typeof usePlanUndoStack>;
