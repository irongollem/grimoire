import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateImage, isProviderRefusal, ProviderRefusedError, sizeToAspect } from "./imageGen.ts";

/**
 * The half of the screening loop our own classifier cannot supply: what the
 * renderer did with a prompt we allowed. A refusal is evidence that a threshold
 * sits too high; a timeout is evidence of nothing, and the two must not land in
 * the log as the same thing.
 */

const BENIGN_SCORES = { "sexual": 0.001, "sexual/minors": 0, "hate": 0, "hate/threatening": 0, "self-harm/instructions": 0 };

function fakeAdmin() {
  const updates: Array<{ id: unknown; patch: Record<string, unknown> }> = [];
  const admin = {
    from() {
      return {
        insert() {
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "row-1" }, error: null }) }) };
        },
        update(patch: Record<string, unknown>) {
          return { eq: (_c: string, id: unknown) => { updates.push({ id, patch }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, updates };
}

/** Routes by URL: the moderation call always passes, the image call is per-test. */
function stubFetch(image: () => { ok: boolean; status?: number; json: () => unknown }) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: { body?: unknown }) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ url, body });
    if (url.includes("/moderations")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ results: [{ category_scores: BENIGN_SCORES }] }) });
    }
    const r = image();
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: () => Promise.resolve(r.json()) });
  }));
  return calls;
}

function opts(provider: "openai" | "gemini", admin: SupabaseClient) {
  return {
    provider, model: provider === "gemini" ? "gemini-3.1-flash-image" : "gpt-image-2",
    apiKey: "sk-render", prompt: "a dwarven cleric", size: "1024x1024",
    screening: { apiKey: "sk-screen", admin, userId: "user-1", generationType: "entity_image" },
  } as const;
}

const OK_IMAGE = () => ({ ok: true, json: () => ({ data: [{ b64_json: "aGk=" }], usage: { output_tokens: 1 } }) });

describe("generateImage — provider verdict recording", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stamps 'rendered' when the image comes back", async () => {
    const { admin, updates } = fakeAdmin();
    stubFetch(OK_IMAGE);

    await generateImage(opts("openai", admin));

    expect(updates).toEqual([{ id: "row-1", patch: { provider_outcome: "rendered" } }]);
  });

  it("classifies OpenAI's moderation_blocked as a refusal and keeps the prompt", async () => {
    const { admin, updates } = fakeAdmin();
    stubFetch(() => ({
      ok: false, status: 400,
      json: () => ({ error: { message: "Your request was rejected as a result of our safety system.", type: "user_error", code: "moderation_blocked" } }),
    }));

    const error = await generateImage(opts("openai", admin)).catch((e) => e);

    expect(isProviderRefusal(error)).toBe(true);
    expect(updates[0].patch).toEqual({ provider_outcome: "refused", prompt: "a dwarven cleric" });
  });

  it("does NOT read an outage as a refusal", async () => {
    // The distinction the log turns on: a 500 says nothing about a threshold,
    // and its prompt text must not be retained on the strength of it.
    const { admin, updates } = fakeAdmin();
    stubFetch(() => ({ ok: false, status: 500, json: () => ({ error: { message: "server error", code: "server_error" } }) }));

    const error = await generateImage(opts("openai", admin)).catch((e) => e);

    expect(isProviderRefusal(error)).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect(updates[0].patch).toEqual({ provider_outcome: "error" });
  });

  it("classifies Gemini's empty-with-a-safety-reason answer as a refusal", async () => {
    // Gemini answers 200 with no image part when it declines, so the reason has
    // to be read out of the body rather than the status.
    const { admin, updates } = fakeAdmin();
    stubFetch(() => ({ ok: true, json: () => ({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }) }));

    const error = await generateImage(opts("gemini", admin)).catch((e) => e);

    expect(error).toBeInstanceOf(ProviderRefusedError);
    expect(updates[0].patch.provider_outcome).toBe("refused");
  });

  it("reads Gemini's promptFeedback.blockReason too", async () => {
    const { admin } = fakeAdmin();
    stubFetch(() => ({ ok: true, json: () => ({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }) }));

    const error = await generateImage(opts("gemini", admin)).catch((e) => e);

    expect(isProviderRefusal(error)).toBe(true);
  });

  it("keeps an empty Gemini response with no reason as a plain error", async () => {
    const { admin, updates } = fakeAdmin();
    stubFetch(() => ({ ok: true, json: () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hm" }] } }] }) }));

    const error = await generateImage(opts("gemini", admin)).catch((e) => e);

    expect(isProviderRefusal(error)).toBe(false);
    expect(updates[0].patch).toEqual({ provider_outcome: "error" });
  });

  it("still sends moderation: low on the generation call", async () => {
    // The screen sits in front of the renderer's own setting; it does not
    // replace it. Both must survive.
    const { admin } = fakeAdmin();
    const calls = stubFetch(OK_IMAGE);

    await generateImage(opts("openai", admin));

    const imageCall = calls.find((c) => c.url.includes("/images/generations"));
    expect(imageCall?.body).toMatchObject({ moderation: "low", output_format: "webp" });
  });

  it("renders unscreened, and logs nothing, when no screening context is given", async () => {
    const calls = stubFetch(OK_IMAGE);

    await generateImage({ provider: "openai", model: "gpt-image-2", apiKey: "sk", prompt: "x", size: "1024x1024" });

    expect(calls.some((c) => c.url.includes("/moderations"))).toBe(false);
  });
});

describe("sizeToAspect", () => {
  it("picks the exact bucket for an already-supported ratio", () => {
    expect(sizeToAspect("1600x900").aspectRatio).toBe("16:9"); // 1.778
    expect(sizeToAspect("900x1600").aspectRatio).toBe("9:16");
    expect(sizeToAspect("1024x1024").aspectRatio).toBe("1:1");
    expect(sizeToAspect("1200x900").aspectRatio).toBe("4:3");
    expect(sizeToAspect("900x1200").aspectRatio).toBe("3:4");
  });

  it("picks the nearest bucket for a ratio Gemini has no exact match for", () => {
    // The AI styler's own map aspect ratios rarely land on one of Gemini's
    // ten discrete buckets exactly — this is the ordinary case, not an edge
    // one. 2:1 (2.0) sits almost exactly between 16:9 (1.778) and 21:9
    // (2.333) in log space, and slightly closer to 16:9.
    expect(sizeToAspect("2000x1000").aspectRatio).toBe("16:9");
  });

  it("treats a very wide map as 21:9 rather than clamping to 16:9", () => {
    expect(sizeToAspect("2560x1000").aspectRatio).toBe("21:9"); // 2.56, closer to 21:9 (2.333) than 16:9 (1.778)
  });

  it("compares distance in log space, not plain linear difference", () => {
    // 2.045 sits between 16:9 (1.778) and 21:9 (2.333). Linearly it's
    // closer to 16:9 (|2.045-1.778|=0.267 vs |2.045-2.333|=0.288), but a
    // proportional (log-space) comparison puts it closer to 21:9
    // (ln(2.045/1.778)=0.140 vs ln(2.045/2.333)=0.132) — the metric this
    // function actually uses, so it picks 21:9. A plain-difference
    // implementation would get this one wrong.
    expect(sizeToAspect("2045x1000").aspectRatio).toBe("21:9");
  });

  it("picks 9:16 for a very tall map, not a nonexistent mirror of 21:9", () => {
    // 21:9 has no reciprocal entry in Gemini's own list (there's no "9:21"),
    // so a very tall map still resolves to the nearest real bucket, 9:16.
    expect(sizeToAspect("1000x2100").aspectRatio).toBe("9:16");
  });

  it("still reads the resolution from the admin quality knob, unaffected by the aspect change", () => {
    expect(sizeToAspect("1600x900", "2K").imageSize).toBe("2K");
    expect(sizeToAspect("1600x900", "bogus").imageSize).toBe("1K");
    expect(sizeToAspect("1600x900").imageSize).toBe("1K");
  });
});
