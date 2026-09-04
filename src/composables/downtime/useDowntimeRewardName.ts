import { useNpcs } from "@/composables/npcs/useNpcs";
import { useItems } from "@/composables/items/useItems";
import { useNotes } from "@/composables/notes/useNotes";
import type { DowntimeRewardType } from "@/types/downtime.types";

/**
 * Resolving a downtime reward's display name on **DM** surfaces.
 *
 * Two DM surfaces need this lookup — the resolved outcome feed on
 * `DowntimeBoardView` and the prepped pile in `DeckBacksPanel` — and each had
 * written its own switch over the same three lists. `DeckBacksPanel`'s was
 * right; the board's had never been generalised past `npc` when Phase 2 made
 * rewards polymorphic, so every item and note reward rendered as
 * "??? (no longer exists)" over a row that was sitting there the whole time.
 *
 * Hence one copy. The failure mode here is not a crash but a *plausible
 * absence*, which nobody reports as a bug until a player asks where their item
 * went — so the thing to protect is that there is a single place to be wrong.
 *
 * DM-only by construction: it reads the full `npcs`/`items`/`notes` lists. The
 * player board resolves against gated projections instead, and treats anything
 * it cannot see as pending rather than absent — a player cannot distinguish
 * "withheld" from "deleted", so only one of those answers is safe to give.
 */
export function useDowntimeRewardName() {
  const { data: npcs } = useNpcs();
  const { data: items } = useItems();
  const { data: notes } = useNotes();

  /**
   * Null means "no name to show" — either the row is genuinely gone, or the
   * kind is one nothing can currently mint and so was never looked up. Callers
   * decide which absence marker that deserves; see `isResolvableRewardType`.
   */
  function rewardName(
    type: DowntimeRewardType | null,
    id: string | null,
  ): string | null {
    if (!type || !id) return null;
    switch (type) {
      case "npc":
        return npcs.value?.find((n) => n.id === id)?.name ?? null;
      case "item":
        return items.value?.find((i) => i.id === id)?.name ?? null;
      case "note":
        return notes.value?.find((n) => n.id === id)?.title ?? null;
      default:
        return null;
    }
  }

  return { rewardName };
}
