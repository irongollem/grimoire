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
 */
export function arrayRevealAdapter(
  visibleTo: Ref<string[]>,
  partyIds: () => readonly string[],
): RevealAdapter {
  return {
    isMemberVisible: (id) => visibleTo.value.includes(id),
    toggleMember: (id) => {
      visibleTo.value = visibleTo.value.includes(id)
        ? visibleTo.value.filter((existing) => existing !== id)
        : [...visibleTo.value, id];
    },
    setWholeParty: () => {
      visibleTo.value = [...partyIds()];
    },
    unshare: () => {
      visibleTo.value = [];
    },
  };
}
