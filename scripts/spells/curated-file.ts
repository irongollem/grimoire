/** Reads src/data/curatedSpellMechanics.json (#1123 follow-up): library spell id to curated entry. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CuratedSpellMechanicsFile } from "@/lib/library/curatedSpellMechanics";

export const CURATED_FILE = join(import.meta.dirname, "../../src/data/curatedSpellMechanics.json");

export function loadCuratedFile(path: string = CURATED_FILE): CuratedSpellMechanicsFile {
  return JSON.parse(readFileSync(path, "utf8")) as CuratedSpellMechanicsFile;
}
