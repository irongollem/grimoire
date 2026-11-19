import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

// How someone who is with the party but cannot be played by the rules (a helper) takes their turns in a fight, on
// this device. Off, the default: every round, as a person at the table would, so they get themselves out of the
// way of the rolling ball without being told to (the maintainer, 18 Nov 2026). On: only when something changed for
// them (`helperTurn.ts`), which saves a turn of the story, and so a credit or so, for every round they would only
// have stood by.
const quiet = useStorage<boolean>("grimoire:ai-table-helpers-quiet", false, safeLocalStorage());

/** The player's choice of how helpers take their turns. A per-viewer convenience kept in the browser. */
export function useTableHelpers() {
  return { quiet };
}
