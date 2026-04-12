import { ref } from "vue";
import { getDiceAudioEnabled, setDiceAudioEnabled } from "@/lib/diceAudio";

const diceAudioEnabled = ref(getDiceAudioEnabled());

export function useDicePrefs() {
  function setDiceAudio(enabled: boolean) {
    diceAudioEnabled.value = enabled;
    setDiceAudioEnabled(enabled);
  }

  return { diceAudioEnabled, setDiceAudio };
}
