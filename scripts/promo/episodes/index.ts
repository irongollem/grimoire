import type { Episode } from "../types.ts";
import { combatDm } from "./combat-dm.ts";
import { combatPlayer } from "./combat-player.ts";
import { questsDm } from "./quests-dm.ts";
import { questsPlayer } from "./quests-player.ts";
import { handoutsDm } from "./handouts-dm.ts";
import { handoutsPlayer } from "./handouts-player.ts";
import { sessionDm } from "./session-dm.ts";
import { sessionPlayer } from "./session-player.ts";
import { sheetsDm } from "./sheets-dm.ts";
import { sheetsPlayer } from "./sheets-player.ts";
import { workshopDm } from "./workshop-dm.ts";
import { workshopPlayer } from "./workshop-player.ts";
import { ytCombat } from "./yt-combat.ts";
import { ytGettingStarted } from "./yt-getting-started.ts";
import { ytSession } from "./yt-session.ts";
import { ytScriptorium } from "./yt-scriptorium.ts";
import { ytSheets } from "./yt-sheets.ts";

/** Every episode the recorder knows, by id. */
export const EPISODES: Episode[] = [workshopDm, workshopPlayer, sheetsPlayer, sheetsDm, sessionDm, sessionPlayer, combatDm, combatPlayer, questsDm, questsPlayer, handoutsDm, handoutsPlayer, ytGettingStarted, ytCombat, ytSheets, ytSession, ytScriptorium];
