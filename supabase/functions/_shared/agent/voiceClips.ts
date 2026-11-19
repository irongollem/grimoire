// The voice clips of the AI table (#1021): where they are kept, and how a sitting's are removed.
//
// A private R2 bucket of its own (the maintainer's choice, 17 Nov 2026), which nothing serves but `table-voice`, to
// the conversation's own owner. Clips are named by campaign and sitting, so "everything of this sitting" is a prefix.

import { deleteObjects, listObjects } from "../r2/client.ts";
import { r2ConfigFrom, type R2Config } from "../r2/config.ts";

/** The clips' store, or null when this stack has no R2 credentials: nothing is kept then, and nothing is to remove. */
export function voiceStoreFrom(env: (key: string) => string | undefined): R2Config | null {
  const r2 = r2ConfigFrom(env);
  if (r2 === null) return null;
  const named = env("R2_VOICE_BUCKET");
  return { ...r2, bucket: named !== undefined && named.trim() !== "" ? named.trim() : "grimoire-table-voices" };
}

/** Under which every clip of one sitting is kept. The trailing slash matters: one sitting's id is never another's prefix. */
export const clipPrefix = (at: { campaignId: string; sessionId: string }): string => `${at.campaignId}/${at.sessionId}/`;

export const clipKey = (at: { campaignId: string; sessionId: string }, name: string): string => `${clipPrefix(at)}${name}.mp3`;

/** Under which the readings of one note are kept (`_shared/noteReading.ts` names each by what was spoken). */
export const noteReadingPrefix = (at: { campaignId: string; noteId: string }): string => `note-readings/${at.campaignId}/${at.noteId}/`;

const REMOVE_BATCH = 50;

/** Removes every clip kept for the sitting. Throws when the store could not be listed or a clip could not be removed. */
export async function removeSittingClips(store: R2Config | null, at: { campaignId: string; sessionId: string }): Promise<void> {
  if (store === null) return;
  const keys = await listObjects(store, clipPrefix(at));
  for (let i = 0; i < keys.length; i += REMOVE_BATCH) await deleteObjects(store, keys.slice(i, i + REMOVE_BATCH));
}

/**
 * The clips kept for an account's sittings, as keys in the clips' store, for the personal data export: the same
 * objects account deletion removes. A sitting whose clips could not be listed is named in `errors`, never
 * silently left out.
 */
export async function listAccountClips(
  store: R2Config | null,
  sittings: ReadonlyArray<{ campaignId: string; sessionId: string }>,
  list: (store: R2Config, prefix: string) => Promise<string[]> = listObjects,
): Promise<{ keys: string[]; errors: string[] }> {
  const keys: string[] = [];
  const errors: string[] = [];
  if (store === null) return { keys, errors };
  for (const sitting of sittings) {
    try {
      keys.push(...(await list(store, clipPrefix(sitting))));
    } catch (error) {
      errors.push(`table voices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { keys, errors };
}

/** Removes every recording kept for a note read aloud (#1021 row 19). Throws when the store could not be listed or emptied. */
export async function removeNoteReadings(store: R2Config | null, at: { campaignId: string; noteId: string }): Promise<void> {
  if (store === null) return;
  const keys = await listObjects(store, noteReadingPrefix(at));
  for (let i = 0; i < keys.length; i += REMOVE_BATCH) await deleteObjects(store, keys.slice(i, i + REMOVE_BATCH));
}

/** The recordings kept for an account's notes read aloud, as keys in the store, for the personal data export. */
export async function listNoteReadings(
  store: R2Config | null,
  notes: ReadonlyArray<{ campaignId: string; noteId: string }>,
  list: (store: R2Config, prefix: string) => Promise<string[]> = listObjects,
): Promise<{ keys: string[]; errors: string[] }> {
  const keys: string[] = [];
  const errors: string[] = [];
  if (store === null) return { keys, errors };
  for (const note of notes) {
    try {
      keys.push(...(await list(store, noteReadingPrefix(note))));
    } catch (error) {
      errors.push(`note readings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { keys, errors };
}

/** Under which every note's recordings of one campaign are kept. */
export const campaignReadingsPrefix = (campaignId: string): string => `note-readings/${campaignId}/`;

/**
 * The recordings nothing refers to any more: of a note that is gone, or of a telling the note has since replaced.
 * `keep` is each note's current recording (`notes.reading_hash`) by note id; a key that is not one of those, or
 * cannot be read as `note-readings/<campaign>/<note>/<hash>.mp3`, is not referenced by anything.
 */
export function unreferencedReadings(keys: readonly string[], campaignId: string, keep: ReadonlyMap<string, string>): string[] {
  const prefix = campaignReadingsPrefix(campaignId);
  return keys.filter((key) => {
    if (!key.startsWith(prefix)) return false;
    const [noteId, file, ...rest] = key.slice(prefix.length).split("/");
    if (rest.length > 0 || file === undefined || !file.endsWith(".mp3")) return true;
    return keep.get(noteId) !== file.slice(0, -4);
  });
}

/** Removes a campaign's note recordings that nothing refers to any more. Answers how many went. */
export async function sweepNoteReadings(store: R2Config | null, campaignId: string, keep: ReadonlyMap<string, string>): Promise<number> {
  if (store === null) return 0;
  const gone = unreferencedReadings(await listObjects(store, campaignReadingsPrefix(campaignId)), campaignId, keep);
  for (let i = 0; i < gone.length; i += REMOVE_BATCH) await deleteObjects(store, gone.slice(i, i + REMOVE_BATCH));
  return gone.length;
}
