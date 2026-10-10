import { ref } from "vue";

/*
  Whether this viewer sees the AI labels (`AiGeneratedBadge`: the chip on
  pictures and the line under AI-drafted prose). On unless they turn it off.

  A viewer's own choice, so it hides the label only on their screen: the mark
  inside the file and the provenance record are untouched, and every other
  viewer still sees the label unless they too switch it off. Kept per device
  like the other display preferences (turn audio, theme override).
*/
const SHOW_AI_LABELS_KEY = "grimoire_show_ai_labels";

const showAiLabels = ref<boolean>(
  typeof localStorage === "undefined" || localStorage.getItem(SHOW_AI_LABELS_KEY) !== "false",
);

/** This viewer's AI-label switch: `showAiLabels` (shared, reactive) and its setter, which persists it. */
export function useAiLabelPrefs() {
  /** Shows or hides the AI labels on this device and remembers the choice. */
  function setShowAiLabels(enabled: boolean) {
    showAiLabels.value = enabled;
    if (typeof localStorage !== "undefined") localStorage.setItem(SHOW_AI_LABELS_KEY, String(enabled));
  }

  return { showAiLabels, setShowAiLabels };
}
