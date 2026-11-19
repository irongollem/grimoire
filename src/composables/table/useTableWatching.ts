import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

// Whether the characters may go on talking among themselves while the player watches (`lib/table/solo/watching.ts`),
// on this device. On by default (the maintainer, 18 Nov 2026: "in some games you want to see how NPCs talk to each
// other sometimes"); each time they go on is a turn of the story and costs what one costs, hence the switch.
const watches = useStorage<boolean>("grimoire:ai-table-watching", true, safeLocalStorage());

/** The player's choice of letting conversations run on. A per-viewer convenience kept in the browser. */
export function useTableWatching() {
  return { watches };
}
