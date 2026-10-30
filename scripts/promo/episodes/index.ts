import type { Episode } from "../types.ts";
import { workshopDm } from "./workshop-dm.ts";
import { workshopPlayer } from "./workshop-player.ts";

/** Every episode the recorder knows, by id. */
export const EPISODES: Episode[] = [workshopDm, workshopPlayer];
