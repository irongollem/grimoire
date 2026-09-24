import { describe, it, expect } from "vitest";
import {
  buildInteractionInput,
  composeFallbackPrompt,
  extractInteractionAudio,
  type FallbackPromptRequest,
} from "@/lib/audio/aiMusic";

// ── composeFallbackPrompt ────────────────────────────────────────────────────
//
// This is a re-export of supabase/functions/_shared/musicPrompt.ts's
// implementation (pure TS, no Deno-specific imports, so it's imported
// directly rather than duplicated — see aiMusic.ts's top comment). The full
// behavioural suite lives in musicPrompt.test.ts; these are a smaller smoke
// test that the re-export is wired correctly plus the fallback path this
// file's local-BYOK caller (generateMusicLocally) actually depends on.

describe("composeFallbackPrompt (re-exported from _shared/musicPrompt)", () => {
  it("builds a minute-based track description with no extra clauses for vocals", () => {
    const req: FallbackPromptRequest = { description: "a tense chase", lengthSeconds: 120, vocals: "vocals" };
    expect(composeFallbackPrompt(req)).toBe("a tense chase. A 2-minute track.");
  });

  it("adds the instrumental clause for instrumental tracks", () => {
    const req: FallbackPromptRequest = { description: "a quiet library", lengthSeconds: 60, vocals: "instrumental" };
    expect(composeFallbackPrompt(req)).toContain("Instrumental only, no vocals.");
  });

  it("adds the wordless-choir clause and drops lyrics for choir tracks", () => {
    const req: FallbackPromptRequest = { description: "a siege", lengthSeconds: 120, vocals: "choir", lyrics: "not sung" };
    expect(composeFallbackPrompt(req)).toBe(
      "a siege. A 2-minute track. Wordless choir only: sung vowels such as ooh and aah, no lyrics, no solo singer.",
    );
  });

  it("appends verbatim lyrics when vocals are requested and lyrics are given", () => {
    const req: FallbackPromptRequest = {
      description: "a heroic ballad",
      lengthSeconds: 120,
      vocals: "vocals",
      lyrics: "[Chorus]\nOnward!",
    };
    expect(composeFallbackPrompt(req)).toBe("a heroic ballad. A 2-minute track.\n\nLyrics:\n[Chorus]\nOnward!");
  });

  it("appends the images sentence when imageCount is set", () => {
    const req: FallbackPromptRequest = { description: "a ruined temple", lengthSeconds: 60, vocals: "instrumental", imageCount: 2 };
    expect(composeFallbackPrompt(req)).toContain("Take the instrumentation, colour and atmosphere from the attached images.");
  });

  it("ignores mentions in the fallback prompt", () => {
    const req: FallbackPromptRequest = {
      description: "a ruined temple",
      lengthSeconds: 60,
      vocals: "instrumental",
      mentions: [{ label: "Kael", description: "A weary paladin." }],
    };
    expect(composeFallbackPrompt(req)).not.toContain("Kael");
  });

  // Regression: a description ending in sentence punctuation used to produce
  // a doubled "..", "!." or "?." before " A N-minute track."
  it("strips a single trailing sentence punctuation mark rather than doubling it", () => {
    const req: FallbackPromptRequest = { description: "a tense conversation.", lengthSeconds: 60, vocals: "instrumental" };
    expect(composeFallbackPrompt(req)).toBe("a tense conversation. A 1-minute track. Instrumental only, no vocals.");
  });
});

// ── buildInteractionInput ────────────────────────────────────────────────────

describe("buildInteractionInput", () => {
  it("returns the plain prompt string when there are no images", () => {
    expect(buildInteractionInput("a tense chase", [])).toBe("a tense chase");
  });

  it("returns the list form with text first, then one block per image", () => {
    const result = buildInteractionInput("a tense chase", [
      { mimeType: "image/jpeg", data: "AAA" },
      { mimeType: "image/png", data: "BBB" },
    ]);
    expect(result).toEqual([
      { type: "text", text: "a tense chase" },
      { type: "image", mime_type: "image/jpeg", data: "AAA" },
      { type: "image", mime_type: "image/png", data: "BBB" },
    ]);
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
