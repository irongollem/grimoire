import { ref } from "vue";
import {
  getDiceAudioEnabled,
  setDiceAudioEnabled,
  getDiceMode,
  setDiceModePref,
  type DiceMode,
} from "@/lib/dice/diceAudio";

const diceAudioEnabled = ref(getDiceAudioEnabled());
const diceMode = ref<DiceMode>(getDiceMode());

export function useDicePrefs() {
  function setDiceAudio(enabled: boolean) {
    diceAudioEnabled.value = enabled;
    setDiceAudioEnabled(enabled);
  }

  function setDiceMode(mode: DiceMode) {
    diceMode.value = mode;
    setDiceModePref(mode);
  }

  return { diceAudioEnabled, setDiceAudio, diceMode, setDiceMode };
}

export type { DiceMode };
