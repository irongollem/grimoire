import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPORT_ENTITY_KINDS } from "@/types/documentImport.types";

/**
 * The extractor's system prompt lives in the **database** (`ai_system_prompts`,
 * `generator_type = 'document_import'`), not in code. That makes it the one
 * part of an AI feature no other gate can see: a typecheck cannot read it, the
 * client tests mock the provider, and the build never opens a database. A
 * prompt that has fallen behind its own schema does not fail — it quietly keeps
 * asking the model for last year's shape, and getting it.
 *
 * That has now happened three times:
 *
 *   * **#822** — the quest generator's prompt still asked for a five-string
 *     `objectives` list months after the schema wanted a beat spine. The model
 *     had been writing one on every call and the schema threw it away.
 *   * **#829** — this prompt still described a quest as a blob of prose and had
 *     never heard of a beat, so the importer could not have produced a graph
 *     however good the code was.
 *   * **#840** — an eighth entity kind was added and the prompt had to be
 *     taught it in the same change, or the model would simply never return one.
 *
 * Three times is a pattern, and this is the part of it a test can hold: **every
 * kind the contract declares must be named in the prompt that asks for it.**
 *
 * Deliberately checked against the *migration*, not the live row. The row is
 * environment state — a developer's local database can be stale or reset, and
 * production is not reachable from a unit test — while the migration is the
 * thing that will be applied everywhere and the thing a reviewer reads. If the
 * two ever disagree, that is the migration workflow failing, which is #825's
 * checklist rather than this file's job.
 */
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");

/** The newest migration that rewrites this prompt — later ones supersede it. */
function latestPromptBody(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      readFileSync(resolve(MIGRATIONS, f), "utf8").includes("generator_type = 'document_import'"),
    );
  const newest = files.at(-1);
  if (!newest) throw new Error("no migration writes the document_import prompt");

  const sql = readFileSync(resolve(MIGRATIONS, newest), "utf8");
  // The prompt is dollar-quoted so it can contain anything; the tag is stable
  // across the migrations that write it.
  const body = /\$prompt\$([\s\S]*?)\$prompt\$/.exec(sql);
  if (!body) throw new Error(`${newest} names the prompt row but has no $prompt$ body`);
  return body[1]!;
}

describe("the document_import prompt covers the extraction contract", () => {
  it("names every entity kind the importer can plan", () => {
    const prompt = latestPromptBody();
    // Matched as the prompt's own bullet form rather than a bare substring:
    // "items" appears inside "magic items" and half a dozen sentences, so a
    // loose `includes` would pass a prompt that never lists the kind at all.
    const missing = IMPORT_ENTITY_KINDS.filter((kind) => !new RegExp(`^- ${kind} `, "m").test(prompt));
    expect(
      missing,
      `the prompt does not ask for: ${missing.join(", ")}. A kind the model is never told about is a kind it never returns — add it to the prompt in the same change that adds it to IMPORT_ENTITY_KINDS.`,
    ).toEqual([]);
  });

  it("still describes a quest as a graph, not a blob (#829)", () => {
    const prompt = latestPromptBody();
    // The three field names that make a quest a spine. If a later rewrite drops
    // them the importer keeps compiling and silently returns single-beat
    // quests again — the generation-one shape this epic deleted.
    for (const field of ["beats", "routes", "objectives"]) {
      expect(prompt, `the prompt no longer asks for a quest's \`${field}\``).toContain(field);
    }
  });
});
