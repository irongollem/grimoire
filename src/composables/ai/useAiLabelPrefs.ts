import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

/*
  Whether this viewer sees the AI labels (`AiGeneratedBadge`: the chip on
  pictures and the line under AI-drafted prose). On unless they turn it off.

  A viewer's own choice, so it hides the label only on their screen: the mark
  inside the file and the provenance record are untouched, and every other
  viewer still sees the label unless they too switch it off. Kept per device
  like the other display preferences (turn audio, theme override).

  `useStorage` over `safeLocalStorage()` rather than raw `localStorage`: it survives storage being
  blocked (the badge is imported on nearly every screen, so a throw while this
  module evaluates would stop lists and editors loading) and follows a change
  made in another tab. The stored value stays the bare string "true"/"false".
*/
const SHOW_AI_LABELS_KEY = "grimoire_show_ai_labels";

const showAiLabels = useStorage<boolean>(SHOW_AI_LABELS_KEY, true, safeLocalStorage(), {
  serializer: { read: (raw) => raw !== "false", write: String },
});

/** This viewer's AI-label switch: `showAiLabels` (shared, reactive) and its setter, which persists it. */
export function useAiLabelPrefs() {
  /** Shows or hides the AI labels on this device and remembers the choice. */
  function setShowAiLabels(enabled: boolean) {
    showAiLabels.value = enabled;
  }

  return { showAiLabels, setShowAiLabels };
}
