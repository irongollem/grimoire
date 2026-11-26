import { getCurrentUser, supabase } from "@/lib/supabase";
import { createCanonPassage } from "@/lib/canon/canonPassageWrites";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import { appendTiptapDoc } from "@/lib/notes/appendTiptap";
import type { NoteWas } from "@/lib/notes/noteSorting";
import type { EntityNote } from "@/types/faction.types";
import type { Note } from "@/types/notes.types";

/** One note on the one-time list, with the note itself. */
export interface NoteToSort {
  was: NoteWas;
  note: Note;
}

interface SortingRow {
  note_id: string;
  was: NoteWas;
  notes: Note | null;
}

/** The campaign's notes still to sort, oldest first. Scoped to the campaign here; RLS only bounds it to the DM. */
export async function fetchNotesToSort(campaignId: string): Promise<NoteToSort[]> {
  const { data, error } = await supabase
    .from("note_sorting")
    .select("note_id, was, notes(*)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as SortingRow[])
    .filter((row): row is SortingRow & { notes: Note } => row.notes !== null)
    .map((row) => ({ was: row.was, note: row.notes }));
}

/** Takes a note off the list. Deleting a row that is already gone (its note was deleted, which cascades) is fine. */
export async function removeFromSortingList(noteId: string): Promise<void> {
  const { error } = await supabase.from("note_sorting").delete().eq("note_id", noteId);
  if (error) throw error;
}

/**
 * A lore entry in Canon from a note: its title, its text, who it was shared with and where it came from. RLS answers
 * a write it refuses with no row and no error, so the row is asked for back and its absence is thrown.
 */
export async function writeLoreEntry(
  note: Pick<Note, "campaign_id" | "title" | "content" | "player_visible_to" | "ai_provenance">,
): Promise<void> {
  if (!note.campaign_id) throw new Error("This note belongs to no campaign, so it has no canon to join.");
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("canon_entries")
    .insert({
      campaign_id: note.campaign_id,
      user_id: user.id,
      part: "lore",
      title: note.title,
      player_visible_to: note.player_visible_to,
      ai_provenance: note.ai_provenance ?? null,
    })
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("The lore entry was not saved: you may not add to this campaign's canon.");
  const entryId = (data[0] as { id: string }).id;
  // The text is the entry's first passage: the entry's own `body` has no field in the lore editor, so text left there is
  // read by players and never seen by the DM (#1279 item 2).
  if (note.content !== null && note.content !== "") {
    try {
      await createCanonPassage(note.campaign_id, { entry_id: entryId, body: note.content, sort_order: 0, ai_provenance: note.ai_provenance ?? null });
    } catch (passageError) {
      // An entry with no text would pass for the whole note once the note is taken off the list: take the entry back too.
      await supabase.from("canon_entries").delete().eq("id", entryId);
      throw passageError;
    }
  }
  // The entry is findable by meaning only once its vector exists.
  queueCanonEmbedding(entryId);
}

/** Sets the note's session, which makes it that session's chronicle entry. */
export async function linkNoteToSession(noteId: string, sessionId: string): Promise<void> {
  const { data, error } = await supabase.from("notes").update({ session_id: sessionId }).eq("id", noteId).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("The note could not be linked: it is gone, or you may not change it.");
}

/** Appends a note's text to a character's own description, read fresh so an edit made meanwhile is not overwritten. */
export async function appendToBackstory(partyMemberId: string, content: string | null): Promise<void> {
  const { data: member, error: readError } = await supabase
    .from("party_members")
    .select("player_description")
    .eq("id", partyMemberId)
    .single();
  if (readError) throw readError;
  const next = appendTiptapDoc((member as { player_description: string | null }).player_description, content);
  if (next === null) throw new Error("This text, or the character's description, is in an older format. Open it to add the text by hand.");
  const { data, error } = await supabase
    .from("party_members")
    .update({ player_description: next })
    .eq("id", partyMemberId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("The character could not be changed.");
}

/**
 * Appends a note's text to the DM's own private note on a party member: the `entity_notes` row the DM-notes box
 * writes (`context/features/dm-notes.md`, the registry's `party_member`), created when there is none yet.
 */
export async function appendToDmNote(
  partyMemberId: string,
  campaignId: string,
  content: string | null,
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data: rows, error: readError } = await supabase
    .from("entity_notes")
    .select("*")
    .eq("entity_type", "party_member")
    .eq("entity_id", partyMemberId)
    .eq("user_id", user.id)
    .eq("is_private", true)
    .eq("written_as_dm", true)
    .order("created_at", { ascending: true })
    .limit(1);
  if (readError) throw readError;
  const existing = (rows as EntityNote[])[0] ?? null;
  const next = appendTiptapDoc(existing?.content ?? null, content);
  if (next === null) throw new Error("This text, or your note on the character, is in an older format. Open it to add the text by hand.");
  if (existing) {
    const { data, error } = await supabase.from("entity_notes").update({ content: next }).eq("id", existing.id).select("id");
    if (error) throw error;
    if (data.length === 0) throw new Error("Your note on the character could not be changed.");
    return;
  }
  const { data, error } = await supabase
    .from("entity_notes")
    .insert({
      entity_type: "party_member",
      entity_id: partyMemberId,
      campaign_id: campaignId,
      user_id: user.id,
      content: next,
      is_private: true,
      shared_with_dm: false,
      written_as_dm: true,
    })
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Your note on the character could not be saved.");
}
