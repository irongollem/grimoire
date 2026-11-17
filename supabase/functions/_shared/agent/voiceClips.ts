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
