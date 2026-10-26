import { ref } from "vue";
import { getWorkshopSoundsEnabled, setWorkshopSoundsEnabled } from "@/lib/crafting/workbenchAudio";

const workshopSoundsEnabled = ref(getWorkshopSoundsEnabled());

export function useWorkshopPrefs() {
  function setWorkshopSounds(enabled: boolean) {
    workshopSoundsEnabled.value = enabled;
    setWorkshopSoundsEnabled(enabled);
  }
  return { workshopSoundsEnabled, setWorkshopSounds };
}
