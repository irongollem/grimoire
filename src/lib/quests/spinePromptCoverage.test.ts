import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Three prompts produce a beat, and all three write through `writeQuestSpine`:
 * the page import (`document_import`), the hook generator (`quest`) and the
 * quest designer (`quest_designer`). Their text lives in the **database**
 * (`ai_system_prompts`), so no typecheck, mocked provider or build can see
 * whether a prompt still asks for what the writer stores. See
 * `extractionPromptCoverage.test.ts` for the three times that has already gone
 * wrong.
 *
 * This is the fourth, and the reason this file exists. On 2 Oct 2026 a quest
 * made from a pasted page landed with `rumor_text` and `reveal_text` empty on
 * every beat, because no prompt had ever asked for either and the shared
 * writer set both to null. Those two columns are all a player is shown of a
 * beat, so the quest could not be shared until the DM had typed both lines
 * into every beat by hand.
 *
 * Checked against the *migration*, not the live row, for the reason the
 * sibling test gives: the migration is what gets applied everywhere and what a
 * reviewer reads.
 */
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const IMPORT_SCHEMA = resolve(process.cwd(), "supabase/functions/import-extract/extractionSchema.ts");

const BEAT_PRODUCERS = ["document_import", "quest", "quest_designer"] as const;
const PLAYER_COPY_FIELDS = ["rumor_text", "reveal_text"] as const;

/** The body the newest migration gives this prompt, from an
 *  `update ... set content = $tag$...$tag$ ... where generator_type = '<type>'`. */
function latestPromptBody(generatorType: string): string {
  const write = new RegExp(
    String.raw`\$(\w*)\$((?:(?!\$\1\$)[\s\S])*)\$\1\$,\s*updated_at = now\(\)\s*where generator_type = '${generatorType}';`,
  );
  const newest = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => ({ file: f, sql: readFileSync(resolve(MIGRATIONS, f), "utf8") }))
    .find(({ sql }) => sql.includes(`generator_type = '${generatorType}'`));
  if (!newest) throw new Error(`no migration writes the ${generatorType} prompt`);
  const body = write.exec(newest.sql);
  if (!body) throw new Error(`${newest.file} names the ${generatorType} prompt row but does not rewrite it in the update form this test reads`);
  return body[2]!;
}

describe("every prompt that produces a beat asks for its player copy", () => {
  it.each(BEAT_PRODUCERS)("the %s prompt names rumor_text and reveal_text", (generatorType) => {
    const prompt = latestPromptBody(generatorType);
    const missing = PLAYER_COPY_FIELDS.filter((field) => !prompt.includes(field));
    expect(
      missing,
      `the ${generatorType} prompt does not ask for: ${missing.join(", ")}. A field the model is never told about is a field it never returns, and a beat without it shows players nothing.`,
    ).toEqual([]);
  });

  it("the import's wire schema requires both on a beat, as strings rather than nullable", () => {
    const source = readFileSync(IMPORT_SCHEMA, "utf8");
    const beat = /const QUEST_BEAT = obj\(\{([\s\S]*?)\n\}\);/.exec(source);
    if (!beat) throw new Error("extractionSchema.ts has no QUEST_BEAT to check");
    for (const field of PLAYER_COPY_FIELDS) {
      expect(beat[1], `QUEST_BEAT.${field} must be a plain string: null is not an answer the model may give`).toMatch(
        new RegExp(String.raw`^\s*${field}: \{ type: "string" \},$`, "m"),
      );
    }
  });
});
