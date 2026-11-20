// The plain-English pieces a turn option's summary is built from.

import type { MapExit } from "../../../../lib/battlemap/mapExits.ts";
import type { MultiattackStep } from "../../../../types/statBlock.types.ts";
import type { Cover, ProvokedAttack } from "../sight.ts";
import type { TurnOptionExposure } from "./types.ts";

/** How a way off reads in a sentence, "leave the map ..." / "toward ...". */
export function wayOffPhrase(kind: MapExit["kind"], label: string | null, leaving: boolean): string {
  if (kind === "edge") return leaving ? "over the edge of the map" : "the edge of the map";
  const name = label === null ? "the entrance" : `"${label}"`;
  return leaving ? `through ${name}` : name;
}

export function movementPart(feet: number | null): string {
  return feet === null || feet === 0 ? "" : `Move ${feet} ft to `;
}

export const COVER_WORDS: Record<Cover, string> = { none: "no cover", half: "half cover", three_quarters: "three-quarters cover", total: "total cover" };

export function provokesPhrase(names: ReadonlyMap<string, string>, provokes: readonly ProvokedAttack[]): string {
  if (provokes.length === 0) return "";
  const who = provokes.map((p) => names.get(p.enemyId)).join(" and ");
  return `; provokes ${provokes.length === 1 ? "an opportunity attack" : "opportunity attacks"} from ${who}`;
}

/** What the mover gains by ending there: the cover it has from each enemy that has any. Without it a move that only
 *  buys cover reads as a longer walk for nothing, and whoever picks the turn cannot weigh it. */
export function exposurePhrase(names: ReadonlyMap<string, string>, exposure: readonly TurnOptionExposure[]): string {
  const covered = exposure.filter((e) => e.cover !== "none");
  if (covered.length === 0) return "";
  return `; ends with ${covered.map((e) => `${COVER_WORDS[e.cover]} from ${names.get(e.enemyId)}`).join(" and ")}`;
}

export const stepsPhrase = (steps: readonly MultiattackStep[]) => steps.map((s) => (s.count === 1 ? s.action : `${s.action} x${s.count}`)).join(", ");

export const andList = (names: readonly string[]): string => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The verb a cast opens with: "Cast" from where the creature stands, "Walk 20 ft and cast" when it moves first (rule 11, moving for a better cast). */
export const castVerb = (feet: number | null): string => (feet === null || feet === 0 ? "Cast" : `Walk ${feet} ft and cast`);
