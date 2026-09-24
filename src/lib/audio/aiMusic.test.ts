/// <reference types="node" />
// This file is under `src/`, so `tsconfig.app.json` owns it — and that config
// deliberately has no `types: ["node"]`, because Node globals must not resolve
// inside browser code. The MUSIC_STRUCTURE_SYSTEM check below is the one case
// in this file that genuinely needs Node (it reads the migration file from
// disk), so it pulls the node types in for itself rather than widening the
// app config for everyone. Mirrors src/__tests__/crossArtifactInvariants.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildStructureMessage,
  composeFallbackPrompt,
  extractInteractionAudio,
  MUSIC_STRUCTURE_SYSTEM,
  type MusicRequest,
} from "@/lib/audio/aiMusic";

// ── buildStructureMessage ────────────────────────────────────────────────────

describe("buildStructureMessage", () => {
  it("includes description, formatted length and vocals for an instrumental request", () => {
    const req: MusicRequest = { description: "a tense chase", lengthSeconds: 60, vocals: "instrumental" };
    const msg = buildStructureMessage(req);
    expect(msg).toBe("Description: a tense chase\nTarget length: 1:00 (60 seconds)\nVocals: instrumental");
  });

  it("appends verbatim lyrics when vocals are requested and lyrics are given", () => {
    const req: MusicRequest = {
      description: "a heroic ballad",
      lengthSeconds: 120,
      vocals: "vocals",
      lyrics: "[Verse 1]\nRise, brave adventurer",
    };
    const msg = buildStructureMessage(req);
    expect(msg).toBe(
      "Description: a heroic ballad\nTarget length: 2:00 (120 seconds)\nVocals: vocals\n\nLyrics:\n[Verse 1]\nRise, brave adventurer",
    );
  });

  it("drops lyrics when the track is instrumental, even if lyrics were passed", () => {
    const req: MusicRequest = {
      description: "a tavern jig",
      lengthSeconds: 60,
      vocals: "instrumental",
      lyrics: "these should not appear",
    };
    const msg = buildStructureMessage(req);
    expect(msg).not.toContain("Lyrics:");
    expect(msg).not.toContain("these should not appear");
  });

  it("drops lyrics when they are empty or whitespace-only", () => {
    const req: MusicRequest = { description: "silence", lengthSeconds: 60, vocals: "vocals", lyrics: "   " };
    const msg = buildStructureMessage(req);
    expect(msg).not.toContain("Lyrics:");
  });

  it("formats a 3-minute length correctly", () => {
    const req: MusicRequest = { description: "epic finale", lengthSeconds: 180, vocals: "instrumental" };
    expect(buildStructureMessage(req)).toContain("Target length: 3:00 (180 seconds)");
  });
});

// ── composeFallbackPrompt ────────────────────────────────────────────────────

describe("composeFallbackPrompt", () => {
  it("builds a minute-based track description with no extra clauses for vocals", () => {
    const req: MusicRequest = { description: "a tense chase", lengthSeconds: 120, vocals: "vocals" };
    const prompt = composeFallbackPrompt(req);
    expect(prompt).toBe("a tense chase. A 2-minute track.");
  });

  it("adds the instrumental clause for instrumental tracks", () => {
    const req: MusicRequest = { description: "a quiet library", lengthSeconds: 60, vocals: "instrumental" };
    const prompt = composeFallbackPrompt(req);
    expect(prompt).toContain("Instrumental only, no vocals.");
  });

  it("appends verbatim lyrics when vocals are requested and lyrics are given", () => {
    const req: MusicRequest = {
      description: "a heroic ballad",
      lengthSeconds: 120,
      vocals: "vocals",
      lyrics: "[Chorus]\nOnward!",
    };
    const prompt = composeFallbackPrompt(req);
    expect(prompt).toBe("a heroic ballad. A 2-minute track.\n\nLyrics:\n[Chorus]\nOnward!");
  });

  it("does not append lyrics for an instrumental track", () => {
    const req: MusicRequest = {
      description: "a tavern jig",
      lengthSeconds: 60,
      vocals: "instrumental",
      lyrics: "should not appear",
    };
    const prompt = composeFallbackPrompt(req);
    expect(prompt).not.toContain("should not appear");
  });
});

// ── extractInteractionAudio ──────────────────────────────────────────────────

describe("extractInteractionAudio", () => {
  it("extracts the audio block from a model_output step", () => {
    const json = {
      steps: [
        { type: "model_output", content: [{ type: "audio", data: "AAAA", mime_type: "audio/wav" }] },
      ],
    };
    expect(extractInteractionAudio(json)).toEqual({ data: "AAAA", mimeType: "audio/wav" });
  });

  it("defaults to audio/mpeg when mime_type is absent", () => {
    const json = { steps: [{ type: "model_output", content: [{ type: "audio", data: "AAAA" }] }] };
    expect(extractInteractionAudio(json)).toEqual({ data: "AAAA", mimeType: "audio/mpeg" });
  });

  it("returns the last audio block when several are present across steps", () => {
    const json = {
      steps: [
        { type: "model_output", content: [{ type: "audio", data: "FIRST", mime_type: "audio/wav" }] },
        { type: "other", content: [{ type: "audio", data: "IGNORED" }] },
        { type: "model_output", content: [{ type: "audio", data: "LAST", mime_type: "audio/flac" }] },
      ],
    };
    expect(extractInteractionAudio(json)).toEqual({ data: "LAST", mimeType: "audio/flac" });
  });

  it("returns the last audio block when several are present within one step", () => {
    const json = {
      steps: [
        {
          type: "model_output",
          content: [
            { type: "audio", data: "FIRST" },
            { type: "text", data: "not audio" },
            { type: "audio", data: "SECOND" },
          ],
        },
      ],
    };
    expect(extractInteractionAudio(json)).toEqual({ data: "SECOND", mimeType: "audio/mpeg" });
  });

  it("ignores non-model_output steps entirely", () => {
    const json = { steps: [{ type: "reasoning", content: [{ type: "audio", data: "NOPE" }] }] };
    expect(extractInteractionAudio(json)).toBeNull();
  });

  it("returns null when there is no audio block", () => {
    const json = { steps: [{ type: "model_output", content: [{ type: "text", data: "hello" }] }] };
    expect(extractInteractionAudio(json)).toBeNull();
  });

  it("returns null on malformed input", () => {
    expect(extractInteractionAudio(null)).toBeNull();
    expect(extractInteractionAudio(undefined)).toBeNull();
    expect(extractInteractionAudio("a string")).toBeNull();
    expect(extractInteractionAudio({})).toBeNull();
    expect(extractInteractionAudio({ steps: "not an array" })).toBeNull();
    expect(extractInteractionAudio({ steps: [{ type: "model_output", content: "not an array" }] })).toBeNull();
    expect(extractInteractionAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: 123 }] }] })).toBeNull();
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
