import { cupTown } from "./cup-town.ts";
import { innDawn } from "./inn-dawn.ts";
import type { Scene } from "./scene.ts";

/** Every picture-book scene, by id: what film.ts can film and the scene page can draw. */
export const SCENES: Scene[] = [innDawn, cupTown];
