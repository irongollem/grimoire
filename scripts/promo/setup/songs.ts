/**
 * The songs Reel's scene: "Late in the Kind Country" on the DM fixture, seen by the player fixture, whom
 * `npm run dev:campaigns` seats there. Kind Country and the demo copy are the only campaigns on the fixture, and the
 * demo shares no songs, so the page shows Kind Country's alone.
 *
 * One thing changes for a take: "Stay a little longer" starts unshared, so the shot that shares it has a shelf to
 * bring in. `teardownSongs` shares it again. The share itself is made with triggers on, on camera, because its
 * doorbell is the point of the shot.
 */
import { quote } from "../../lib/dev-db.ts";
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { localDb } from "./demo.ts";
import { kindCountryCampaignId } from "./kind-country.ts";

const SHARED_PLAYLIST = "Bright Stars";
export const LATER_PLAYLIST = "Stay a little longer";

function setPlaylistShared(name: string, shared: boolean): string {
  return `update public.soundboard_playlists set players_can_listen = ${shared} where campaign_id = ${quote(kindCountryCampaignId())} and name = ${quote(name)};`;
}

/** The offstage DM ticks "Players can listen" on a playlist; the change rings the campaign doorbell. */
export function sharePlaylist(name: string): void {
  runSqlFile(localDb(), setPlaylistShared(name, true));
}

export function setupSongs(): void {
  runSqlFile(localDb(), `begin; ${setPlaylistShared(SHARED_PLAYLIST, true)} ${setPlaylistShared(LATER_PLAYLIST, false)} commit;`);
}

/** Puts both playlists back shared, as the campaign has them. Safe to run twice. */
export function teardownSongs(): void {
  runSqlFile(localDb(), `begin; ${setPlaylistShared(SHARED_PLAYLIST, true)} ${setPlaylistShared(LATER_PLAYLIST, true)} commit;`);
}
