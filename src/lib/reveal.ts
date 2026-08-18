import type { Ref } from "vue";

/**
 * Revealing an entity to players means two independent things, and both matter:
 *
 *   **who** — which party members can see it at all
 *   **what** — how much of it they see (an NPC's fields, a monster's stat
 *              block, a location's description / NPCs / inventory)
 *
 * "Who" is identical everywhere and belongs in one control. "What" differs per
 * entity and belongs in a slot. Losing the second half is the failure mode to
 * guard against: several surfaces today offer only "who", which silently makes
 * the reveal less useful than the one next to it.
 *
 * Beneath "who" there are two storage models — a `player_visible_to[]` column
 * on most entities, and the monster discovery row, where absence means "not
 * discovered" and `visible_to === null` means "everyone". The control must not
 * know which it is talking to, hence this adapter: four operations that both
 * models can implement. `useMonsterVisibility` already exposes exactly these
 * names, so it satisfies the interface as-is.
 */
export interface RevealAdapter {
  isMemberVisible(memberId: string): boolean;
  toggleMember(memberId: string): void;
  /** Reveal to the whole party in one action. */
  setWholeParty(): void;
  /** Hide from everyone. */
  unshare(): void;
}

/**
 * Which shape the reveal control wears. The presentations themselves are
 * documented on `RevealControl`'s `form` prop; the union lives here because six
 * components declare it — the control plus one wrapper per storage model — and
 * when it was written out six times, adding `inline` to the control left the
 * five wrappers unable to pass it through.
 */
export type RevealForm = "button" | "overlay" | "inline";

/** How widely an entity is currently revealed. Drives the button's appearance. */
export type RevealState = "private" | "partial" | "everyone";

export function revealState(
  partyIds: readonly string[],
  isMemberVisible: (id: string) => boolean,
): RevealState {
  if (!partyIds.length) return "private";
  const seen = partyIds.filter(isMemberVisible).length;
  if (seen === 0) return "private";
  return seen === partyIds.length ? "everyone" : "partial";
}

/**
 * Button text. Names the audience rather than the mechanism — a DM is deciding
 * who is looking at something, not operating a visibility system.
 */
export function revealLabel(state: RevealState, sharedCount: number): string {
  if (state === "everyone") return "Whole party";
  if (state === "partial") return `${sharedCount} player${sharedCount === 1 ? "" : "s"}`;
  return "Hidden";
}

/**
 * Adapter over the ordinary `player_visible_to: string[]` column.
 *
 * `partyIds` is a getter rather than a value because the party can load after
 * the control mounts, and "reveal to the whole party" must mean the party as it
 * is at the moment of the click.
 *
 * `onChange` fires once per user action, with the new list. Persisting belongs
 * here rather than in a watcher on `visibleTo`, and the difference is not
 * stylistic: a watcher that saves will re-fire when the save's refetch pushes a
 * fresh array back into the ref, because the identity changed even though the
 * contents did not. That is an endless write loop — and on entities that
 * re-embed on save, an endless loop of edge-function calls behind it.
 *
 * Omit `onChange` where a parent owns saving, such as an editor with its own
 * Save button.
 */
export function arrayRevealAdapter(
  visibleTo: Ref<string[]>,
  partyIds: () => readonly string[],
  onChange?: (next: string[]) => void,
): RevealAdapter {
  const apply = (next: string[]) => {
    visibleTo.value = next;
    onChange?.(next);
  };
  return {
    isMemberVisible: (id) => visibleTo.value.includes(id),
    toggleMember: (id) =>
      apply(
        visibleTo.value.includes(id)
          ? visibleTo.value.filter((existing) => existing !== id)
          : [...visibleTo.value, id],
      ),
    setWholeParty: () => apply([...partyIds()]),
    unshare: () => apply([]),
  };
}
