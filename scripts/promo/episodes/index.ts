import type { Episode } from "../types.ts";
import { combatDm } from "./combat-dm.ts";
import { combatPlayer } from "./combat-player.ts";
import { sessionDm } from "./session-dm.ts";
import { sessionPlayer } from "./session-player.ts";
import { sheetsDm } from "./sheets-dm.ts";
import { sheetsPlayer } from "./sheets-player.ts";
import { workshopDm } from "./workshop-dm.ts";
import { workshopPlayer } from "./workshop-player.ts";

/** Every episode the recorder knows, by id. */
export const EPISODES: Episode[] = [workshopDm, workshopPlayer, sheetsPlayer, sheetsDm, sessionDm, sessionPlayer, combatDm, combatPlayer];
