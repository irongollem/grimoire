/**
 * State the Inspect layer (pins on the pages) and the Inspect drawer (the list)
 * must agree on, though the shell mounts them apart: where each note landed,
 * whether done notes show, and which note the drawer just asked to open.
 * One record per book, created on first use and dropped when the layer leaves.
 */
import { ref, type Ref } from "vue";
import type { NotePlacement } from "./notePlacement";

export interface InspectNotesState {
  showDone: Ref<boolean>;
  placements: Ref<Map<string, NotePlacement>>;
  focusNoteId: Ref<string | null>;
}

const states = new Map<string, InspectNotesState>();

export function inspectNotesState(documentId: string): InspectNotesState {
  let state = states.get(documentId);
  if (!state) {
    state = { showDone: ref(false), placements: ref(new Map()), focusNoteId: ref(null) };
    states.set(documentId, state);
  }
  return state;
}

/** The layer is gone, so the placements it published are stale. `showDone` is a preference and stays. */
export function clearInspectPlacements(documentId: string): void {
  const state = states.get(documentId);
  if (!state) return;
  state.placements.value = new Map();
  state.focusNoteId.value = null;
}
