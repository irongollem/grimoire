// Deno edge-function modules run under vitest here for their pure logic only
// (see vitest.config.ts's `supabase/functions/**` include, same pattern as
// lyria.test.ts). The MUSIC_STRUCTURE_SYSTEM check below needs Node's `fs` to
// read the migration file straight off disk.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildStructureMessage,
  composeFallbackPrompt,
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

// ── composeFallbackPrompt ────────────────────────────────────────────────────

describe("composeFallbackPrompt", () => {
  it("is the description plus a length sentence for a sung track", () => {
    expect(composeFallbackPrompt({ ...base, lengthSeconds: 120, vocals: "vocals" })).toBe("a tense chase. A 2-minute track.");
  });

  it("says instrumental tracks are instrumental and choir tracks are wordless", () => {
    expect(composeFallbackPrompt(base)).toContain("Instrumental only, no vocals.");
    expect(composeFallbackPrompt({ ...base, vocals: "choir" })).toContain("no lyrics, no solo singer");
  });

  it("appends lyrics verbatim and last for a sung track, even with images attached", () => {
    const prompt = composeFallbackPrompt({ ...base, vocals: "vocals", lyrics: "[Chorus]\nOnward!", imageCount: 1 });
    expect(prompt.endsWith("\n\nLyrics:\n[Chorus]\nOnward!")).toBe(true);
    expect(prompt.indexOf("attached images")).toBeLessThan(prompt.indexOf("Lyrics:"));
  });

  it.each(["instrumental", "choir"] as const)("leaves lyrics off a %s track", (vocals) => {
    expect(composeFallbackPrompt({ ...base, vocals, lyrics: "should not appear" })).not.toContain("should not appear");
  });

  it("points at the attached images only when there are some", () => {
    expect(composeFallbackPrompt({ ...base, imageCount: 2 })).toContain("from the attached images");
    expect(composeFallbackPrompt({ ...base, imageCount: 0 })).not.toContain("attached images");
    expect(composeFallbackPrompt(base)).not.toContain("attached images");
  });

  it("stays minimal: mentions and the title are not copied in", () => {
    const prompt = composeFallbackPrompt({ ...base, title: "Rosie's Defense", mentions: [{ label: "Kael", description: "A weary paladin." }] });
    expect(prompt).not.toContain("Kael");
    expect(prompt).not.toContain("Rosie");
  });

  // Regression: a description ending in sentence punctuation used to produce a
  // doubled "..", "!." or "?." before the length sentence (25 Sep 2026).
  it.each(["a tense conversation.", "charge into battle!", "who goes there?"])(
    "strips one trailing sentence mark from %j rather than doubling it",
    (description) => {
      const prompt = composeFallbackPrompt({ ...base, description });
      expect(prompt).toContain(`${description.slice(0, -1)}. A 1-minute track.`);
    },
  );

  it("strips only one mark, and none from a description without one", () => {
    expect(composeFallbackPrompt({ ...base, description: "wait..." })).toContain("wait... A 1-minute track.");
    expect(composeFallbackPrompt({ ...base, description: "a quiet library" })).toContain("a quiet library. A 1-minute track.");
  });
});

// ── MUSIC_STRUCTURE_SYSTEM stays identical to the migration's seed ──────────

describe("MUSIC_STRUCTURE_SYSTEM", () => {
  it("matches the $prompt$ body seeded by the Lyria 3.5 migration", () => {
    // process.cwd(), not __dirname — Vitest's module runner otherwise resolves
    // an http:// URL for import.meta.url, and cwd is the project root here.
    const migrationPath = path.join(
      process.cwd(),
      "supabase/migrations/20260924201957_upgrade_music_generation_to_lyria_3_5.sql",
    );
    const sql = readFileSync(migrationPath, "utf-8");
    const match = /\$prompt\$([\s\S]*?)\$prompt\$/.exec(sql);
    expect(match).not.toBeNull();
    expect(MUSIC_STRUCTURE_SYSTEM).toBe(match![1]);
  });
});
