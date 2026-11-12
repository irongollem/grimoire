/**
 * The scene for the `yt-scriptorium` video, in the local demo copy only.
 *
 * It is the handout Reels' scene (`setupHandouts`: the keeper's letter on its Letter paper, nobody holds it yet,
 * the player's read marks cleared) plus two things of its own:
 * - The glass hound watercolour, put in the DM fixture's own folder of the `asset-images` bucket. "Browse pictures"
 *   lists exactly that folder under "Document Art" (`ArtPickerModal`, `listOwnedPaths`), so the picture the video
 *   picks is a file the DM "uploaded" and not a path the page was told about.
 * - A sweep of the book the take starts from the Adventure Module template.
 *
 * What the take changes, and what puts it back (the teardown, and the setup before the next take):
 * - The new "Adventure Module" book, its chapters and everything written in it: deleted whole.
 * - The letter given to the party and the player's read marks: `setupHandouts` rewrites the letter and clears them.
 * - The hound file in storage: removed by the teardown, uploaded again by the setup.
 * - The Illuminator's saved pictures (`ill-*`, `sheet-*`) the take wrote into the fixture's folder of the same bucket:
 *   removed by the teardown, by creation time (everything in that folder from before the take is left alone).
 * The two library books (The Locked Workshop, Fishing Minigame) are only read, never written.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { AI_PRO_REOFFER_NOTICE_VERSION } from "../../../supabase/functions/_shared/provenance/consent.ts";
import { FIXTURE_EMAIL, runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { readLocalStack } from "../../lib/dev-stack.ts";
import { demoCampaignId, localDb } from "./demo.ts";
import { setupHandouts, teardownHandouts } from "./handouts.ts";

/** The watercolour of the demo's Spun Glass Hound (never committed: it lives with the other promo assets). */
const HOUND_FILE = "promo-out/handout-art/hound.webp";
/** The file name shows on the picture's tooltip in the picker. */
const HOUND_NAME = "glass-hound.webp";

/** The title `useStartScriptoriumDocument` gives a book started from the Adventure Module template. */
export const NEW_BOOK_TITLE = "Adventure Module";

function bucket() {
  const stack = readLocalStack();
  return createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from("asset-images");
}

function houndPath(): string {
  const owner = sql(localDb(), `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  if (!owner) throw new Error("The DM fixture does not exist. Run `npm run dev:auth`.");
  return `${owner}/${HOUND_NAME}`;
}

/** The books a take started, in the demo copy only. Chapters, notes and shares go with them (cascade). */
function sweepBooksSql(): string {
  return `delete from public.scriptorium_documents
           where campaign_id = ${quote(demoCampaignId())} and kind = 'book' and title = ${quote(NEW_BOOK_TITLE)};`;
}

/** When this take's setup ran; null if the teardown runs in a process that never set up. */
let takeStarted: string | null = null;

export async function setupYtScriptorium(): Promise<void> {
  takeStarted = new Date().toISOString();
  if (!existsSync(HOUND_FILE)) throw new Error(`The glass hound watercolour is missing: ${HOUND_FILE}`);
  runSqlFile(localDb(), `begin; ${sweepBooksSql()} commit;`);
  await setupHandouts();
  // The demo copy has AI off and the fixture is Pro, so the one-time "Your Pro plan includes AI credits" chooser
  // would open over the first click of a take. The fixture has answered it (as "Not now"), which leaves AI off.
  const owner = sql(localDb(), `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  runSqlFile(
    localDb(),
    `insert into public.ai_acknowledgements (user_id, kind, version)
       values (${quote(owner)}, 'ai_pro_reoffer', ${quote(AI_PRO_REOFFER_NOTICE_VERSION)}) on conflict do nothing;`,
  );
  const { error } = await bucket().upload(houndPath(), readFileSync(HOUND_FILE), { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Could not upload the glass hound: ${error.message}`);
}

/** After the last shot, filmed or failed. */
export async function teardownYtScriptorium(): Promise<void> {
  runSqlFile(localDb(), `begin; ${sweepBooksSql()} commit;`);
  teardownHandouts();
  const made = takeStarted === null
    ? []
    : sql(
        localDb(),
        `select name from storage.objects
          where bucket_id = 'asset-images' and name like ${quote(`${houndPath().split("/")[0]}/%`)}
            and created_at >= ${quote(takeStarted)}::timestamptz`,
      )
        .split("\n")
        .filter((name) => name !== "");
  await bucket().remove([houndPath(), ...made]);
}
