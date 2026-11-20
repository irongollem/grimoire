import type { Note } from "@/types/notes.types";

/**
 * The one-time list of notes to sort (#1226 story 6). Lore and session notes were canon's before canon had a place
 * for them; the DM sorts each one, because lore and session notes were also used for player characters' backgrounds
 * and nothing may be moved on a guess.
 */
export type NoteWas = "lore" | "session";

export type SortChoice =
  | { kind: "lore" }
  | { kind: "session"; sessionId: string }
  | { kind: "backstory"; partyMemberId: string }
  | { kind: "dm-note"; partyMemberId: string }
  | { kind: "keep" };

export type SortKind = SortChoice["kind"];

export const SORT_KIND_LABELS: Record<SortKind, string> = {
  lore: "A lore entry in Canon",
  session: "A session's chronicle entry",
  backstory: "A character's backstory",
  "dm-note": "My note on a character",
  keep: "Keep as a note",
};

/** The likeliest destination, preselected: a lore note is a lore entry, a session note belongs to a session. */
export function suggestedKind(was: NoteWas): SortKind {
  return was === "lore" ? "lore" : "session";
}

/** What each write step does; the composable wires these to the database, a test to spies. */
export interface SortWrites {
  createLoreEntry(entry: Pick<Note, "title" | "content" | "player_visible_to" | "ai_provenance">): Promise<void>;
  linkToSession(noteId: string, sessionId: string): Promise<void>;
  appendBackstory(partyMemberId: string, content: string | null): Promise<void>;
  appendDmNote(partyMemberId: string, content: string | null): Promise<void>;
  deleteNote(noteId: string): Promise<void>;
  removeFromList(noteId: string): Promise<void>;
}

/** Which step failed: "write" left the note exactly as it was; "cleanup" means the text is already at its destination. */
export class SortStepError extends Error {
  constructor(
    readonly step: "write" | "delete-note" | "remove-from-list",
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "Could not sort the note", { cause });
  }
}

async function step<T>(name: SortStepError["step"], run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new SortStepError(name, cause);
  }
}

/**
 * Sends one note where the DM chose. The order is the point: the destination is written first, then the note is
 * deleted (when its text has moved), then its place on the list is removed. A failure stops right there, so text is
 * never lost: a failed write deletes nothing, and a failed delete leaves the text in both places rather than neither.
 */
export async function sortNote(note: Note, choice: SortChoice, writes: SortWrites): Promise<void> {
  let moved = true;
  switch (choice.kind) {
    case "lore":
      await step("write", () => writes.createLoreEntry(note));
      break;
    case "backstory":
      await step("write", () => writes.appendBackstory(choice.partyMemberId, note.content));
      break;
    case "dm-note":
      await step("write", () => writes.appendDmNote(choice.partyMemberId, note.content));
      break;
    case "session":
      await step("write", () => writes.linkToSession(note.id, choice.sessionId));
      moved = false;
      break;
    case "keep":
      moved = false;
      break;
  }
  if (moved) await step("delete-note", () => writes.deleteNote(note.id));
  await step("remove-from-list", () => writes.removeFromList(note.id));
}

/** What the DM is told when a step fails: where the text is now. */
export function sortFailureMessage(title: string, error: SortStepError): string {
  const name = title.trim() || "This note";
  if (error.step === "write") return `${name} was not moved, and is still in your notes. ${error.message}`;
  if (error.step === "delete-note") return `${name} was copied, but could not be removed from your notes, so it is in both places. ${error.message}`;
  return `${name} was sorted, but it is still on the list. ${error.message}`;
}
