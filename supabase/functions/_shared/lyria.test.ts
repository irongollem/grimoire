import { describe, it, expect } from "vitest";
import {
  buildLyriaRequest,
  extractLyriaAudio,
  audioExtension,
  normalizeImageMime,
  LYRIA_INTERACTIONS_URL,
  LYRIA_MAX_IMAGES,
  LYRIA_IMAGE_MIME_TYPES,
} from "./lyria.ts";

describe("LYRIA_INTERACTIONS_URL", () => {
  it("points at the Interactions API, not the old generateContent endpoint", () => {
    expect(LYRIA_INTERACTIONS_URL).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  });
});

describe("buildLyriaRequest", () => {
  it("builds the request body with store: false", () => {
    expect(buildLyriaRequest("lyria-3.5", "a tense dungeon crawl theme")).toEqual({
      model: "lyria-3.5",
      input: "a tense dungeon crawl theme",
      store: false,
    });
  });

  it("keeps input a plain string when images is an explicit empty array", () => {
    expect(buildLyriaRequest("lyria-3.5", "a tense dungeon crawl theme", [])).toEqual({
      model: "lyria-3.5",
      input: "a tense dungeon crawl theme",
      store: false,
    });
  });

  it("builds a multi-part input with the text block first, then images in order", () => {
    const images = [
      { mimeType: "image/jpeg", data: "aGk=" },
      { mimeType: "image/png", data: "Ymll" },
    ];
    expect(buildLyriaRequest("lyria-3.5", "a tense dungeon crawl theme", images)).toEqual({
      model: "lyria-3.5",
      input: [
        { type: "text", text: "a tense dungeon crawl theme" },
        { type: "image", mime_type: "image/jpeg", data: "aGk=" },
        { type: "image", mime_type: "image/png", data: "Ymll" },
      ],
      store: false,
    });
  });

  it("still sets store: false with images attached", () => {
    const result = buildLyriaRequest("lyria-3.5", "prompt", [{ mimeType: "image/webp", data: "d2Vi" }]);
    expect(result.store).toBe(false);
  });
});

describe("LYRIA_MAX_IMAGES", () => {
  it("is 10", () => {
    expect(LYRIA_MAX_IMAGES).toBe(10);
  });
});

describe("extractLyriaAudio", () => {
  function modelOutputStep(content: unknown[]) {
    return { type: "model_output", content };
  }

  it("extracts the audio block from a single model_output step", () => {
    const json = { steps: [modelOutputStep([{ type: "audio", data: "aGk=", mime_type: "audio/wav" }])] };
    expect(extractLyriaAudio(json)).toEqual({ data: "aGk=", mimeType: "audio/wav" });
  });

  it("falls back to audio/mpeg when mime_type is absent (MP3 is the default output)", () => {
    const json = { steps: [modelOutputStep([{ type: "audio", data: "aGk=" }])] };
    expect(extractLyriaAudio(json)).toEqual({ data: "aGk=", mimeType: "audio/mpeg" });
  });

  it("ignores text blocks (generated lyrics / song structure)", () => {
    const json = {
      steps: [modelOutputStep([{ type: "text", data: "not audio" }, { type: "audio", data: "aGk=" }])],
    };
    expect(extractLyriaAudio(json)).toEqual({ data: "aGk=", mimeType: "audio/mpeg" });
  });

  it("ignores steps that are not model_output", () => {
    const json = {
      steps: [
        { type: "user_input", content: [{ type: "audio", data: "should-be-ignored" }] },
        modelOutputStep([{ type: "audio", data: "aGk=" }]),
      ],
    };
    expect(extractLyriaAudio(json)).toEqual({ data: "aGk=", mimeType: "audio/mpeg" });
  });

  it("takes the LAST audio block across all model_output steps", () => {
    const json = {
      steps: [
        modelOutputStep([{ type: "audio", data: "first" }]),
        { type: "text_only", content: [{ type: "audio", data: "wrong-step-type" }] },
        modelOutputStep([{ type: "audio", data: "second" }, { type: "audio", data: "third" }]),
      ],
    };
    expect(extractLyriaAudio(json)).toEqual({ data: "third", mimeType: "audio/mpeg" });
  });

  it("returns null when there is no audio block", () => {
    expect(extractLyriaAudio({ steps: [modelOutputStep([{ type: "text", data: "lyrics only" }])] })).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(extractLyriaAudio(null)).toBeNull();
    expect(extractLyriaAudio(undefined)).toBeNull();
    expect(extractLyriaAudio("a string")).toBeNull();
    expect(extractLyriaAudio({})).toBeNull();
    expect(extractLyriaAudio({ steps: "not-an-array" })).toBeNull();
    expect(extractLyriaAudio({ steps: [{ type: "model_output", content: "not-an-array" }] })).toBeNull();
    expect(extractLyriaAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: 42 }] }] })).toBeNull();
    expect(extractLyriaAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: "" }] }] })).toBeNull();
    expect(extractLyriaAudio({ steps: [null, "garbage", 5] })).toBeNull();
  });
});

describe("LYRIA_IMAGE_MIME_TYPES", () => {
  it("accepts jpeg, png and webp", () => {
    expect(LYRIA_IMAGE_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("normalizeImageMime", () => {
  it("lowercases and passes through an accepted mime type", () => {
    expect(normalizeImageMime("image/jpeg")).toBe("image/jpeg");
    expect(normalizeImageMime("IMAGE/PNG")).toBe("image/png");
  });

  it("strips parameters before comparing", () => {
    expect(normalizeImageMime("image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(normalizeImageMime("image/webp;charset=binary")).toBe("image/webp");
  });

  it("returns null for a disallowed or missing content type", () => {
    expect(normalizeImageMime("image/gif")).toBeNull();
    expect(normalizeImageMime("application/octet-stream")).toBeNull();
    expect(normalizeImageMime(null)).toBeNull();
    expect(normalizeImageMime("")).toBeNull();
  });
});

describe("audioExtension", () => {
  it("maps known mime types to their extension", () => {
    expect(audioExtension("audio/ogg")).toBe("ogg");
    expect(audioExtension("audio/wav")).toBe("wav");
    expect(audioExtension("audio/webm")).toBe("webm");
    expect(audioExtension("audio/flac")).toBe("flac");
    expect(audioExtension("audio/mp4")).toBe("m4a");
    expect(audioExtension("audio/x-m4a")).toBe("m4a");
  });
  it("defaults to mp3 for mpeg and anything unrecognized", () => {
    expect(audioExtension("audio/mpeg")).toBe("mp3");
    expect(audioExtension("application/octet-stream")).toBe("mp3");
  });
});
