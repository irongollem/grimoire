import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

// Whether foes with a mind and a tongue say a line in a fight when the moment earns one (`foeLine.ts`), on this
// device. On by default (the maintainer, 18 Nov 2026: "smart enemies may speak and or mock players during a
// fight"); each line is a turn of the story and costs about what one costs, hence the switch.
const talk = useStorage<boolean>("grimoire:ai-table-foes-talk", true, safeLocalStorage());

/** The player's choice of letting foes speak in a fight. A per-viewer convenience kept in the browser. */
export function useTableFoes() {
  return { talk };
}
