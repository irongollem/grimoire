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

export function useAiLabelPrefs() {
  function setShowAiLabels(enabled: boolean) {
    showAiLabels.value = enabled;
    if (typeof localStorage !== "undefined") localStorage.setItem(SHOW_AI_LABELS_KEY, String(enabled));
  }

  return { showAiLabels, setShowAiLabels };
}
