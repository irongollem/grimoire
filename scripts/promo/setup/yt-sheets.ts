/**
 * The scene for the `yt-sheets` video, in the local demo copy only.
 *
 * It is the Reels' scene (`setupSheets`: Chicory at full health, her slots
 * unused, the rest of the party worn a little) plus a chat sweep. The video rolls
 * dice and casts Bless through the player preview, and every roll and cast posts a
 * line to the campaign chat; those lines are the take's, not the demo's.
 *
 * What the take changes, and what puts it back:
 * - Chicory's hit points, conditions, Bless slot and concentration: `setupSheets`,
 *   run again by the teardown so the real app is left as it was.
 * - Chat lines posted while filming: swept by the teardown, from the moment this
 *   setup ran (never a fixed date, which once deleted a developer's own lines).
 * Nothing else is written: the level-up wizard is opened and left without Confirm.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb } from "./demo.ts";
import { setupSheets } from "./sheets.ts";

/** When this take's setup ran; null if the teardown runs in a process that never set up. */
let takeStarted: string | null = null;

export function setupYtSheets(): void {
  takeStarted = new Date().toISOString();
  setupSheets();
}

/** After the last shot, filmed or failed: Chicory back to full, and the take's chat lines gone. */
export function teardownYtSheets(): void {
  setupSheets();
  // Without a start time there is no safe cutoff, so nothing is deleted.
  if (takeStarted === null) return;
  runSqlFile(
    localDb(),
    `delete from public.campaign_messages
      where campaign_id = ${quote(demoCampaignId())} and created_at >= ${quote(takeStarted)}::timestamptz;`,
  );
}
