/**
 * What a page's Generate button calls (#1270): the generator's inputs open as a card in the Familiar, with the
 * generator's own starting inputs and whatever the page already knows. Nothing is asked of the model and nothing is
 * charged until the DM presses the card's gilt button.
 */
import { useAskUiStore, type PendingGenerator } from "@/stores/ui/ask";

export function useOpenGenerator() {
  const ui = useAskUiStore();
  function open(generatorId: string, options: Omit<PendingGenerator, "generatorId"> = {}) {
    ui.openGenerator(generatorId, options);
  }
  return { open };
}
