/**
 * A screen's side of the hand-over Ask Grimoire makes (#1253): `apply(text, inputs)` runs once with the DM's request and the screen's choices she named, when
 * the screen mounts with one waiting and again whenever Ask offers a new one while the screen is already open (the DM
 * asked from inside the fight). Never runs the screen's own action: the DM presses its button, which quotes there.
 */
import { watch } from "vue";
import { useAskPrefillStore, type AskPrefillInputs } from "@/stores/ui/askPrefill";

export function useAskPrefill(screenId: string, apply: (text: string, inputs: AskPrefillInputs) => void): void {
  const store = useAskPrefillStore();
  watch(
    () => store.pending[screenId],
    (offered) => {
      if (!offered) return;
      const taken = store.takeOffer(screenId);
      if (taken !== null) apply(taken.text, taken.inputs);
    },
    { immediate: true },
  );
}
