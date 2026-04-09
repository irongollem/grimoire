// Module-level singleton — shared between PlayerEncounterView and PlayerSettingsView.
import { ref } from "vue";

const TURN_AUDIO_KEY = "grimoire_turn_audio";

const turnAudioEnabled = ref<boolean>(
  localStorage.getItem(TURN_AUDIO_KEY) !== "false", // default: on
);

export function usePlayerCombatPrefs() {
  function setTurnAudio(enabled: boolean) {
    turnAudioEnabled.value = enabled;
    localStorage.setItem(TURN_AUDIO_KEY, String(enabled));
  }

  return { turnAudioEnabled, setTurnAudio };
}
