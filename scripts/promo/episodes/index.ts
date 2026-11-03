import type { Episode } from "../types.ts";
import { combatDm } from "./combat-dm.ts";
import { combatPlayer } from "./combat-player.ts";
import { sessionDm } from "./session-dm.ts";
import { sessionPlayer } from "./session-player.ts";
import { sheetsDm } from "./sheets-dm.ts";
import { sheetsPlayer } from "./sheets-player.ts";
import { workshopDm } from "./workshop-dm.ts";
import { workshopPlayer } from "./workshop-player.ts";
import { ytCombat } from "./yt-combat.ts";
import { ytGettingStarted } from "./yt-getting-started.ts";
import { ytSession } from "./yt-session.ts";
import { ytSheets } from "./yt-sheets.ts";

/** Every episode the recorder knows, by id. */
export const EPISODES: Episode[] = [workshopDm, workshopPlayer, sheetsPlayer, sheetsDm, sessionDm, sessionPlayer, combatDm, combatPlayer, ytGettingStarted, ytCombat, ytSheets, ytSession];
