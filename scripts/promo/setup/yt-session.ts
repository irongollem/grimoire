/**
 * The `yt-session` video's scene, in the local demo copy only.
 *
 * It is `setupSession`'s scene (two ended sessions, a deliberate dashboard
 * layout, a swept chat, Sister Ribbon hidden again) plus one thing the Reels do
 * not do: the DM types a note on Sister Ribbon on camera. That note is the
 * NPC's own `npcs.notes` column, and typing it also stamps a `dm_note_touches`
 * row (the scratchpad's "This session" list). The teardown puts the note back
 * byte for byte, from a copy taken before the take, and removes the touch.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb } from "./demo.ts";
import { setupSession, teardownSession } from "./session.ts";

/** The NPC the video writes a DM note on; the session Reels reveal the same one. */
export const NOTED_NPC = "Sister Ribbon";

interface SavedNote {
  id: string;
  /** `notes is null`: a null note and an empty one are different rows to put back. */
  wasNull: boolean;
  /** The text as base64 on one line, so no quoting or newline can alter it on the way back. */
  b64: string;
}

let saved: SavedNote | null = null;
let takeStarted: string | null = null;

export function setupYtSession(): void {
  setupSession();
  takeStarted = new Date().toISOString();
  const c = quote(demoCampaignId());
  const row = sql(
    localDb(),
    `select id || E'\\t' || (notes is null)::text || E'\\t' || coalesce(replace(encode(convert_to(notes, 'UTF8'), 'base64'), E'\\n', ''), '')
       from public.npcs where campaign_id = ${c} and name = ${quote(NOTED_NPC)} limit 1`,
  );
  if (!row) throw new Error(`The demo campaign has no NPC named "${NOTED_NPC}". Has the demo template changed?`);
  const [id, wasNull, b64] = row.split("\t");
  saved = { id, wasNull: wasNull === "true", b64: b64 ?? "" };
}

/** Ends the session and sweeps the chat (session.ts), then puts Sister Ribbon's note and the scratchpad list back. Safe if setup never got as far as the copy. */
export function teardownYtSession(): void {
  try {
    teardownSession();
  } finally {
    if (saved) {
      const c = quote(demoCampaignId());
      const note = saved.wasNull ? "null" : `convert_from(decode(${quote(saved.b64)}, 'base64'), 'UTF8')`;
      runSqlFile(
        localDb(),
        `begin;
         update public.npcs set notes = ${note} where id = ${quote(saved.id)};
         delete from public.dm_note_touches
          where campaign_id = ${c} and entity_type = 'npc' and entity_id = ${quote(saved.id)}
            and touched_at >= ${quote(takeStarted ?? new Date(Date.now() - 3_600_000).toISOString())}::timestamptz;
         commit;`,
      );
    }
  }
}
