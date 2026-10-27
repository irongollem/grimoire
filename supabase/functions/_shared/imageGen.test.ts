import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateImage, isProviderRefusal, ProviderRefusedError, resolveImageProvider, sizeToAspect } from "./imageGen.ts";
import { isPromptRejected } from "./moderation.ts";

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

  it("never reaches the paid renderer when the screen refuses the prompt", async () => {
    const { admin } = fakeAdmin();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ results: [{ category_scores: { ...BENIGN_SCORES, "sexual/minors": 0.95 } }] }),
      });
    }));

    const error = await generateImage(opts("openai", admin)).catch((e) => e);

    expect(isPromptRejected(error)).toBe(true);
    expect(calls.some((url) => url.includes("/images/generations"))).toBe(false);
  });

  it("adds the Gemini style booster only when asked, so a map is not given dramatic lighting", async () => {
    const { admin } = fakeAdmin();
    const sentPrompts: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: { body?: unknown }) => {
      if (url.includes("/moderations")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ results: [{ category_scores: BENIGN_SCORES }] }) });
      }
      const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
      sentPrompts.push(body.contents[0].parts[0].text);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ inlineData: { data: "aGk=", mimeType: "image/png" } }] } }] }),
      });
    }));

    await generateImage({ ...opts("gemini", admin), boostStyle: true });
    await generateImage({ ...opts("gemini", admin), boostStyle: false });

    expect(sentPrompts[0]).toMatch(/volumetric lighting/);
    expect(sentPrompts[1]).toBe("a dwarven cleric");
  });

  it("renders unscreened, and logs nothing, when no screening context is given", async () => {
    const calls = stubFetch(OK_IMAGE);

    await generateImage({ provider: "openai", model: "gpt-image-2", apiKey: "sk", prompt: "x", size: "1024x1024" });

    expect(calls.some((c) => c.url.includes("/moderations"))).toBe(false);
  });
});

describe("sizeToAspect", () => {
  // The bucket choice itself is geminiAspect.ts's, tested there; this is the
  // wiring: the size string is read, and the resolution comes from the quality knob.
  it("reads the aspect off a WxH size, with spaces and any case", () => {
    expect(sizeToAspect("1600x900").aspectRatio).toBe("16:9");
    expect(sizeToAspect(" 900 X 1600 ").aspectRatio).toBe("9:16");
  });

  it("falls back to a square for a size it cannot read", () => {
    expect(sizeToAspect("banana").aspectRatio).toBe("1:1");
  });

  it("takes the resolution from the admin quality knob, and defaults to 1K for anything else", () => {
    expect(sizeToAspect("1600x900", "2K").imageSize).toBe("2K");
    expect(sizeToAspect("1600x900", "bogus").imageSize).toBe("1K");
    expect(sizeToAspect("1600x900").imageSize).toBe("1K");
  });
});

describe("resolveImageProvider — which model a surface renders on", () => {
  const keys = { campaignKeys: {}, platformKeys: { openai: "sk-platform", gemini: "g-platform" } };
  const providerConfigs = {
    openai: { image_model: "gpt-image-2.5-flare", map_style_model: "gpt-image-2.5-sunburst", chronicle_image_model: "gpt-image-2.5-sunburst", image_enabled: true },
    gemini: { image_model: "gemini-3.1-flash-image", map_style_model: null, chronicle_image_model: null, image_enabled: true },
  };

  it("renders entity art on the general image model", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs })?.model).toBe("gpt-image-2.5-flare");
  });

  it("gives the map styler and the Chronicler their own model setting", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs, surface: "map_style" })?.model).toBe("gpt-image-2.5-sunburst");
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs, surface: "chronicle" })?.model).toBe("gpt-image-2.5-sunburst");
  });

  it("falls back to the image model when a surface's setting is empty", () => {
    expect(resolveImageProvider({ imageProvider: "gemini", ...keys, providerConfigs, surface: "map_style" })?.model).toBe("gemini-3.1-flash-image");
  });

  it("falls back to flare, never gpt-image-2, when nothing is configured", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs: { openai: { image_enabled: true } }, surface: "chronicle" })?.model).toBe("gpt-image-2.5-flare");
  });
});

describe("resolveImageProvider — which provider renders", () => {
  const platformKeys = { openai: "sk-platform", gemini: "g-platform" };
  const bothOn = { openai: { image_enabled: true }, gemini: { image_enabled: true } };
  const geminiOff = { openai: { image_enabled: true }, gemini: { image_enabled: false } };

  it("honours the campaign's Quick / Detailed choice while the admin has it enabled", () => {
    const img = resolveImageProvider({ imageProvider: "gemini", campaignKeys: {}, platformKeys, providerConfigs: bothOn });
    expect(img).toMatchObject({ provider: "gemini", base: "gemini", apiKey: "g-platform", isByok: false });
  });

  it("moves a choice the admin switched off onto an enabled provider", () => {
    const img = resolveImageProvider({ imageProvider: "gemini", campaignKeys: {}, platformKeys, providerConfigs: geminiOff });
    expect(img).toMatchObject({ provider: "openai", base: "openai", apiKey: "sk-platform", isByok: false });
  });

  it("renders on nothing when every provider is switched off", () => {
    const allOff = { openai: { image_enabled: false }, gemini: { image_enabled: false } };
    expect(resolveImageProvider({ imageProvider: "openai", campaignKeys: {}, platformKeys, providerConfigs: allOff })).toBeNull();
  });

  it("uses the campaign's own key for its choice whatever the switch says", () => {
    const img = resolveImageProvider({ imageProvider: "gemini", campaignKeys: { gemini: "g-own" }, platformKeys, providerConfigs: geminiOff });
    expect(img).toMatchObject({ provider: "gemini", apiKey: "g-own", isByok: true });
  });

  it("falls back to the DM's own key before platform credits when the choice is switched off", () => {
    const img = resolveImageProvider({ imageProvider: "gemini", campaignKeys: { openai: "sk-own" }, platformKeys, providerConfigs: geminiOff });
    expect(img).toMatchObject({ provider: "openai", apiKey: "sk-own", isByok: true });
  });

  it("offers a provider the admin switched on without picking a model", () => {
    const img = resolveImageProvider({ imageProvider: "gemini", campaignKeys: {}, platformKeys, providerConfigs: { gemini: { image_enabled: true, image_model: null } } });
    expect(img).toMatchObject({ provider: "gemini", model: "gemini-3.1-flash-image", isByok: false });
  });

  it("keeps a pinned capability on its provider even when that provider is not offered as a choice", () => {
    const openaiOff = { openai: { image_enabled: false }, gemini: { image_enabled: true } };
    const img = resolveImageProvider({ imageProvider: "openai", campaignKeys: {}, platformKeys, providerConfigs: openaiOff, pinned: true });
    expect(img).toMatchObject({ provider: "openai", apiKey: "sk-platform" });
  });
});
