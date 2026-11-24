// Deno edge-function modules run under vitest here for their pure logic only
// (see vitest.config.ts's `supabase/functions/**` include, same pattern as
// lyria.test.ts). The MUSIC_STRUCTURE_SYSTEM check below needs Node's `fs` to
// read the migration file straight off disk.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildStructureMessage,
  MUSIC_STRUCTURE_SYSTEM,
  type MusicRequest,
} from "./musicPrompt.ts";

// ── buildStructureMessage ────────────────────────────────────────────────────

const base = { description: "a tense chase", lengthSeconds: 60, vocals: "instrumental" } as const satisfies MusicRequest;

describe("buildStructureMessage", () => {
  it("is laid out the way the system prompt says the model receives it: title, description, length, vocals", () => {
    expect(buildStructureMessage({ ...base, title: "  Rosie's Defense " })).toBe(
      "Title: Rosie's Defense\nDescription: a tense chase\nTarget length: 1:00 (60 seconds)\nVocals: instrumental",
    );
  });

  it("omits a blank title", () => {
    expect(buildStructureMessage({ ...base, title: "   " })).not.toContain("Title:");
  });

  it.each([
    [60, "1:00 (60 seconds)"],
    [120, "2:00 (120 seconds)"],
    [180, "3:00 (180 seconds)"],
  ] as const)("writes a %i second track as %s", (lengthSeconds, written) => {
    expect(buildStructureMessage({ ...base, lengthSeconds })).toContain(`Target length: ${written}`);
  });

  it("sends lyrics verbatim and last, only for a sung track", () => {
    const sung = buildStructureMessage({
      ...base,
      vocals: "vocals",
      lyrics: "[Chorus]\nOnward!",
      mentions: [{ label: "Kael", description: "A weary paladin." }],
      imageCount: 2,
    });
    expect(sung.endsWith("Lyrics:\n[Chorus]\nOnward!")).toBe(true);
    expect(sung.indexOf("Mentioned:")).toBeLessThan(sung.indexOf("Lyrics:"));
    expect(sung.indexOf("Images attached")).toBeLessThan(sung.indexOf("Lyrics:"));
  });

  it.each(["instrumental", "choir"] as const)("drops lyrics a %s track was given, so the model cannot sing them", (vocals) => {
    const msg = buildStructureMessage({ ...base, vocals, lyrics: "these should not appear" });
    expect(msg).not.toContain("Lyrics:");
    expect(msg).not.toContain("these should not appear");
  });

  it("drops lyrics that are only whitespace", () => {
    expect(buildStructureMessage({ ...base, vocals: "vocals", lyrics: "   " })).not.toContain("Lyrics:");
  });

  it("lists each mention, with its description when it has one", () => {
    const msg = buildStructureMessage({
      ...base,
      mentions: [
        { label: "Kael", description: "A weary paladin haunted by his order's fall." },
        { label: "The Sunken Keep", description: null },
      ],
    });
    expect(msg).toContain("Mentioned:\n- Kael: A weary paladin haunted by his order's fall.\n- The Sunken Keep");
    expect(msg).not.toContain("The Sunken Keep:");
  });

  it("omits the Mentioned block without mentions", () => {
    expect(buildStructureMessage({ ...base, mentions: [] })).not.toContain("Mentioned:");
  });

  it("states how many images reach Lyria, and says nothing for zero or none", () => {
    expect(buildStructureMessage({ ...base, imageCount: 3 })).toContain("Images attached for Lyria: 3");
    expect(buildStructureMessage({ ...base, imageCount: 0 })).not.toContain("Images attached");
    expect(buildStructureMessage(base)).not.toContain("Images attached");
  });
});

// ── MUSIC_STRUCTURE_SYSTEM stays identical to the row the migrations build ──

const MIGRATIONS = path.join(process.cwd(), "supabase/migrations");
const SEED = "20260924201957_upgrade_music_generation_to_lyria_3_5.sql";

/** The row as production holds it: the seed, then every later replace() on it, in version order. */
function seededRow(): string {
  const seed = /\$prompt\$([\s\S]*?)\$prompt\$/.exec(readFileSync(path.join(MIGRATIONS, SEED), "utf-8"));
  expect(seed).not.toBeNull();
  let row = seed![1];
  const later = readdirSync(MIGRATIONS).filter((f) => f > SEED && f.endsWith(".sql")).sort();
  for (const file of later) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf-8");
    if (!sql.includes("generator_type = 'music_structure'")) continue;
    for (const [, from, to] of sql.matchAll(/\$o\$([\s\S]*?)\$o\$,\s*\$n\$([\s\S]*?)\$n\$/g)) {
      // A replace() whose old text is gone does nothing in the database, so it must not here either; fail instead,
      // because a migration that matches nothing is a prompt edit that never shipped.
      expect(row, `${file} replaces text the row no longer holds`).toContain(from);
      row = row.replace(from, to);
    }
  }
  return row;
}

describe("MUSIC_STRUCTURE_SYSTEM", () => {
  it("matches the seeded row with every later migration's edits applied", () => {
    expect(MUSIC_STRUCTURE_SYSTEM).toBe(seededRow());
  });

  it("keeps a brief the DM wrote rather than composing it again", () => {
    expect(MUSIC_STRUCTURE_SYSTEM).toContain("## When the DM has already written the music");
    expect(MUSIC_STRUCTURE_SYSTEM).toContain("The Intro and the Outro are optional.");
  });
});
