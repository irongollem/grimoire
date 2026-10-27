import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import {
  buildInteractionInput,
  composeFallbackPrompt,
  extractInteractionAudio,
  generateMusicLocally,
  MUSIC_MAX_IMAGES,
} from "@/lib/audio/aiMusic";

// composeFallbackPrompt is a re-export of supabase/functions/_shared/musicPrompt.ts, whose own suite holds its
// behaviour. One case here proves the re-export is wired to the right function.
describe("composeFallbackPrompt (re-exported from _shared/musicPrompt)", () => {
  it("builds a minute-based track description, with the instrumental clause when asked", () => {
    expect(composeFallbackPrompt({ description: "a quiet library", lengthSeconds: 60, vocals: "instrumental" })).toBe(
      "a quiet library. A 1-minute track. Instrumental only, no vocals.",
    );
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


// ── generateMusicLocally ─────────────────────────────────────────────────────

describe("generateMusicLocally", () => {
  const AUDIO = btoa("RIFFdata");
  const fetchMock = vi.fn();

  const apiOk = (audio: Record<string, unknown> | null = { type: "audio", data: AUDIO, mime_type: "audio/wav" }) =>
    new Response(JSON.stringify({ steps: audio ? [{ type: "model_output", content: [audio] }] : [] }), { status: 200 });
  const imageResponse = (type: string, bytes = 4) =>
    new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": type } });
  /** The calls made to the Lyria API (not to image URLs). */
  const apiCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("generativelanguage"));

  beforeEach(() => {
    fake.reset();
    fake.seed("provider_config", [{ provider: "gemini", audio_model: "lyria-3.5" }]);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to run with no music model configured, reading only the gemini row", async () => {
    fake.reset();
    fake.seed("provider_config", [
      { provider: "openai", audio_model: "someone-elses-model" },
      { provider: "gemini", audio_model: null },
    ]);
    await expect(generateMusicLocally("a chase", "key")).rejects.toThrow("No music model is configured.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the configured model and the DM's own key, and hands back the audio as a file", async () => {
    fetchMock.mockResolvedValueOnce(apiOk());

    const { file, model } = await generateMusicLocally("a chase", "my-key");

    expect(model).toBe("lyria-3.5");
    const [, init] = apiCalls()[0];
    expect(init.headers["x-goog-api-key"]).toBe("my-key");
    expect(JSON.parse(init.body)).toEqual({ model: "lyria-3.5", input: "a chase", store: false });
    expect(file.type).toBe("audio/wav");
    expect(file.name).toMatch(/^ai-generated-\d+\.wav$/);
    expect(await file.text()).toBe("RIFFdata");
  });

  it("names a file of an unfamiliar type .mp3", async () => {
    fetchMock.mockResolvedValueOnce(apiOk({ type: "audio", data: AUDIO, mime_type: "audio/x-unknown" }));
    const { file } = await generateMusicLocally("a chase", "key");
    expect(file.name).toMatch(/\.mp3$/);
  });

  it("attaches each image once, however many times it is listed", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("generativelanguage") ? apiOk() : imageResponse("image/png; charset=binary")));

    await generateMusicLocally("a temple", "key", ["https://x/a.png", "https://x/b.png", "https://x/a.png"]);

    const body = JSON.parse(apiCalls()[0][1].body);
    expect(body.input).toHaveLength(3); // the text, then two images
    expect(body.input.slice(1).map((b: { mime_type: string }) => b.mime_type)).toEqual(["image/png", "image/png"]);
  });

  it("throws rather than dropping images past the limit, and sends nothing", async () => {
    const urls = Array.from({ length: MUSIC_MAX_IMAGES + 1 }, (_, i) => `https://x/${i}.png`);
    await expect(generateMusicLocally("a temple", "key", urls)).rejects.toThrow(`at most ${MUSIC_MAX_IMAGES} images`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts exactly the image limit", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("generativelanguage") ? apiOk() : imageResponse("image/jpeg")));
    const urls = Array.from({ length: MUSIC_MAX_IMAGES }, (_, i) => `https://x/${i}.jpg`);
    await expect(generateMusicLocally("a temple", "key", urls)).resolves.toMatchObject({ model: "lyria-3.5" });
  });

  it.each([
    ["the fetch fails", () => Promise.reject(new TypeError("network"))],
    ["the server answers an error", () => Promise.resolve(new Response("nope", { status: 404 }))],
    ["it is not an image type Lyria reads", () => Promise.resolve(imageResponse("image/gif"))],
    ["it has no content type", () => Promise.resolve(new Response(new Uint8Array(4), { status: 200 }))],
    ["it is over 10 MB", () => Promise.resolve(imageResponse("image/png", 10 * 1024 * 1024 + 1))],
  ])("throws, and sends no request, when an attached image cannot be used because %s", async (_why, respond) => {
    fetchMock.mockImplementation((url: string) => (url.includes("generativelanguage") ? Promise.resolve(apiOk()) : respond()));
    await expect(generateMusicLocally("a temple", "key", ["https://x/a.png"])).rejects.toThrow("Could not read an attached image.");
    expect(apiCalls()).toHaveLength(0);
  });

  it("reports the API's own error message, or its status when it gives none", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 }));
    await expect(generateMusicLocally("a chase", "key")).rejects.toThrow("Quota exceeded");
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    await expect(generateMusicLocally("a chase", "key")).rejects.toThrow("Lyria API error 502");
  });

  it("says so when the response carries no audio", async () => {
    fetchMock.mockResolvedValueOnce(apiOk(null));
    await expect(generateMusicLocally("a chase", "key")).rejects.toThrow("No audio data in Lyria response.");
  });
});
