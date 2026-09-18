import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCATION_TYPE_TIER } from "@/lib/locations/tiers";

/**
 * `extractionSchema.ts` (supabase/functions/import-extract/) cannot import
 * `src/lib/locations/tiers.ts` — one is Deno, one is Vite — so its
 * `LOCATION_TYPE_ENUM` is a hand-copied mirror of `LOCATION_TYPE_TIER`'s keys,
 * which are themselves the TypeScript form of the DB's own `location_type_enum`
 * (verified live 18 Sep 2026). A real production extraction returned free-text
 * types the model invented ("mine", "mine room", "mountain", "underground
 * region") before that constraint existed, which `resolveEnum` (normalize.ts)
 * silently downgraded to `other` — a type `private.location_can_hold_rooms`
 * never accepts, so a keyed area's own container could never satisfy the
 * room-parent guard no matter what the page said.
 *
 * Same "read the file, don't import it" idiom as `extractionPromptCoverage.test.ts`
 * uses for the prompt migration — this is what stops the copy drifting the next
 * time a location type is added, renamed, or retired in `tiers.ts` without the
 * wire schema following.
 */
const SCHEMA_PATH = resolve(process.cwd(), "supabase/functions/import-extract/extractionSchema.ts");

function extractedLocationTypeEnum(): string[] {
  const source = readFileSync(SCHEMA_PATH, "utf8");
  const match = /LOCATION_TYPE_ENUM\s*=\s*\{[\s\S]*?enum:\s*\[([\s\S]*?)\]/.exec(source);
  if (!match) throw new Error("extractionSchema.ts has no LOCATION_TYPE_ENUM.enum to check");
  return match[1]!
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "null")
    .map((entry) => entry.slice(1, -1)); // strip the surrounding quotes
}

describe("the extraction schema's location_type enum mirrors LOCATION_TYPE_TIER", () => {
  it("names exactly the same location types, no more and no fewer", () => {
    const schemaTypes = extractedLocationTypeEnum().sort();
    const tierTypes = Object.keys(LOCATION_TYPE_TIER).sort();
    expect(schemaTypes).toEqual(tierTypes);
  });

  it("marks the field nullable, since a page can genuinely omit a location's type", () => {
    const source = readFileSync(SCHEMA_PATH, "utf8");
    const match = /LOCATION_TYPE_ENUM\s*=\s*\{([\s\S]*?)\n\};/.exec(source);
    expect(match?.[1]).toMatch(/type:\s*\["string",\s*"null"\]/);
    expect(match?.[1]).toContain("null");
  });
});
