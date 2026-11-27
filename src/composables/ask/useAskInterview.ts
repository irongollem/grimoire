/**
 * "Tell me your story" (#1282, story 8b): the way through "Design it with me" where the DM talks and the Familiar
 * asks. It is only a mode of the conversation: while it is active every turn carries `mode: "interview"`, and
 * the thread since it began is what "Turn this into my canon" hands to the document import.
 */
import { computed, ref, type Ref } from "vue";
import { INTERVIEW_OPENING } from "@/lib/ask/askWalkCopy";
import { IMPORT_PATH, IMPORT_SCREEN_ID, TOLD_STORY_NAME, composeStory, hasTold } from "@/lib/ask/askInterviewStory";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import type { AskItem, NewItem } from "./askItems";

export interface AskInterviewDeps {
  items: Ref<AskItem[]>;
  push: (item: NewItem) => AskItem;
}

export function useAskInterview(deps: AskInterviewDeps) {
  const active = ref(false);
  /** The id of the Familiar's opening: the interview is every item from it on. */
  const from = ref<number | null>(null);

  function start() {
    if (active.value) return;
    active.value = true;
    from.value = deps.push({ kind: "reply", text: INTERVIEW_OPENING, who: null }).id;
  }

  function leave() {
    active.value = false;
    from.value = null;
  }

  /** What the DM has told so far, as the import reads it; null until they have said something. */
  const story = computed(() => (from.value === null ? null : composeStory(deps.items.value, from.value)));
  /** Whether "Turn this into my canon" has anything to turn. */
  const told = computed(() => from.value !== null && hasTold(deps.items.value, from.value));

  return { active, story, told, start, leave };
}

export type AskInterview = ReturnType<typeof useAskInterview>;

/** Leaves the told story for the import's paste step and returns where it is: the button and the screen both end here. */
export function offerToldStory(text: string): string {
  useAskPrefillStore().offer(IMPORT_SCREEN_ID, text, { ownWriting: "true", displayName: TOLD_STORY_NAME });
  return IMPORT_PATH;
}
