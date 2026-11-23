import type { CanonClue, CanonEntry, CanonLorePassage } from "@/types/canon.types";

export type SecretState = "hidden" | "partly" | "revealed";

/**
 * Where a secret stands, derived and never stored: revealed once the DM has pressed Reveal, partly known once any
 * clue is found, hidden otherwise. Finding every clue does not reveal it: the last step is the DM's button.
 */
export function secretState(secret: CanonEntry, clues: readonly CanonClue[]): SecretState {
  if (secret.revealed_at !== null) return "revealed";
  return clues.some((c) => c.found_at !== null) ? "partly" : "hidden";
}

export const SECRET_STATE_LABEL: Record<SecretState, string> = {
  hidden: "Hidden",
  partly: "Partly known",
  revealed: "Revealed",
};

/** A shape beside each word, so the state never rests on colour alone: empty, half, full. */
export const SECRET_STATE_MARK: Record<SecretState, string> = { hidden: "○", partly: "◐", revealed: "●" };

/** "1 of 3 clues found", or "No clues placed" for a secret with none. */
export function clueTally(clues: readonly CanonClue[]): string {
  if (clues.length === 0) return "No clues yet";
  const found = clues.filter((c) => c.found_at !== null).length;
  return `${found} of ${clues.length} ${clues.length === 1 ? "clue" : "clues"} found`;
}

/** The frame's rule of thumb: a secret wants three clues so the party can miss two and still find it. */
export const CLUES_WANTED = 3;

/** What a clue that is a lore passage is filed with. */
export interface PassageClueInput {
  secret_id: string;
  passage_id: string;
  title: string;
  sort_order: number;
  found_at?: string;
  found_session_id?: string | null;
}

/**
 * The clue a lore passage becomes for a secret (#1255 item 5). It is named by the passage's heading and lies nowhere of
 * its own: the passage says where it comes out. Telling a passage finds its clues in the database, but only at the
 * moment it is told, so a passage that was told before it became a clue files the clue already found, at that time.
 */
export function passageClue(
  passage: Pick<CanonLorePassage, "id" | "title" | "told_at" | "told_session_id">,
  secretId: string,
  sortOrder: number,
): PassageClueInput {
  const title = passage.title.trim() === "" ? "A lore passage" : passage.title.trim();
  const base = { secret_id: secretId, passage_id: passage.id, title, sort_order: sortOrder };
  return passage.told_at === null ? base : { ...base, found_at: passage.told_at, found_session_id: passage.told_session_id };
}
