// Module-level singleton — shared between PlayerEncounterView and PlayerSettingsView.
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

const TURN_AUDIO_KEY = "grimoire_turn_audio";

// Bare "true"/"false" strings, on unless "false"; storage errors and other
// tabs' changes are handled by useStorage.
const turnAudioEnabled = useStorage<boolean>(TURN_AUDIO_KEY, true, safeLocalStorage(), {
  serializer: { read: (raw) => raw !== "false", write: String },
});

export function usePlayerCombatPrefs() {
  function setTurnAudio(enabled: boolean) {
    turnAudioEnabled.value = enabled;
  }

  return { turnAudioEnabled, setTurnAudio };
}
