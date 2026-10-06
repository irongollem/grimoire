/**
 * Which paper doll control a viewer gets (#975). Free accounts have no credits
 * and a doll costs 100, so a player without enough asks their DM, who draws it
 * from their own credits. A DM may draw any character's doll unasked.
 *
 * - `make`: "Make my doll" / "Redraw" (the viewer pays); `label` says which.
 * - `ask`: "Ask my DM" (the player cannot afford it and has not asked yet).
 * - `asked`: a status line with "Withdraw" (the ask is open).
 * - `none`: viewing someone else's character without being their DM.
 */
export type DollControl = "make" | "ask" | "asked" | "none";

export interface DollActionInput {
  isOwner: boolean;
  isDm: boolean;
  /** Whether the viewer's balance covers a doll (true while it is still loading). */
  affordable: boolean;
  /** The character has an open ask (`doll_requested_at` is set). */
  asked: boolean;
  /** The character already has its own drawn doll. */
  hasDoll: boolean;
}

export interface DollAction {
  control: DollControl;
  /** Button label for `make`; the DM's wording differs from the player's. */
  label: string;
  /** Show "Asked by the player" beside the DM's Make / Redraw button. */
  askedByPlayer: boolean;
}

export function dollAction({ isOwner, isDm, affordable, asked, hasDoll }: DollActionInput): DollAction {
  if (isDm) {
    return {
      control: "make",
      label: hasDoll ? "Redraw" : "Make doll",
      askedByPlayer: asked,
    };
  }
  if (!isOwner) return { control: "none", label: "", askedByPlayer: false };
  if (affordable) {
    return { control: "make", label: hasDoll ? "Redraw" : "Make my doll", askedByPlayer: false };
  }
  return { control: asked ? "asked" : "ask", label: "", askedByPlayer: false };
}
