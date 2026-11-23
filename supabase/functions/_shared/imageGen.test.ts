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

  it("adds the Gemini style booster only when asked, so a map is not given dramatic lighting and a portrait no deep background", async () => {
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
    await generateImage({ ...opts("gemini", admin), boostStyle: "portrait" });

    expect(sentPrompts[0]).toMatch(/volumetric lighting/);
    expect(sentPrompts[0]).toMatch(/foreground-to-background/);
    expect(sentPrompts[1]).toBe("a dwarven cleric");
    // A portrait keeps painterly lighting but not the scene booster's deep
    // background, which pushed NPCs toward a hero shot against a landscape.
    expect(sentPrompts[2]).toMatch(/^a dwarven cleric — .*rim light/);
    expect(sentPrompts[2]).not.toMatch(/foreground-to-background/);
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
    openai: { image_model: "gpt-image-2.6-flare", map_style_model: "gpt-image-2.6-sunburst", chronicle_image_model: "gpt-image-2.6-sunburst", brush_tip_model: "gpt-image-2.6-sunburst", image_enabled: true },
    gemini: { image_model: "gemini-3.1-flash-image", map_style_model: null, chronicle_image_model: null, brush_tip_model: null, image_enabled: true },
  };

  it("renders entity art on the general image model", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs })?.model).toBe("gpt-image-2.6-flare");
  });

  it("gives the map styler and the Chronicler their own model setting", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs, surface: "map_style" })?.model).toBe("gpt-image-2.6-sunburst");
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs, surface: "chronicle" })?.model).toBe("gpt-image-2.6-sunburst");
  });

  // Bug: brush tips rendered on the general model because the surface was not wired to its column.
  it("gives brush tips their own model setting, and falls back to the image model when empty", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs, surface: "brush_tip" })?.model).toBe("gpt-image-2.6-sunburst");
    expect(resolveImageProvider({ imageProvider: "gemini", ...keys, providerConfigs, surface: "brush_tip" })?.model).toBe("gemini-3.1-flash-image");
  });

  it("falls back to the image model when a surface's setting is empty", () => {
    expect(resolveImageProvider({ imageProvider: "gemini", ...keys, providerConfigs, surface: "map_style" })?.model).toBe("gemini-3.1-flash-image");
  });

  it("falls back to flare, never gpt-image-2, when nothing is configured", () => {
    expect(resolveImageProvider({ imageProvider: "openai", ...keys, providerConfigs: { openai: { image_enabled: true } }, surface: "chronicle" })?.model).toBe("gpt-image-2.6-flare");
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

describe("generateImage — edit mask", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubEdit() {
    const forms: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: { body?: unknown }) => {
      if (init?.body instanceof FormData) forms.push(init.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [{ b64_json: "aGk=" }] }) });
    }));
    return forms;
  }
  const edit = { provider: "openai" as const, model: "m", apiKey: "sk", prompt: "p", size: "1024x1024", sourceImages: [new Blob(["a"], { type: "image/png" })] };

  it("sends the mask as the `mask` field, and the PNG crop as a png, when given", async () => {
    const forms = stubEdit();
    await generateImage({ ...edit, mask: new Blob(["m"], { type: "image/png" }) });
    expect((forms[0].get("mask") as File).type).toBe("image/png");
    expect((forms[0].getAll("image[]")[0] as File).type).toBe("image/png");
  });

  it("sends no mask field when none is given", async () => {
    const forms = stubEdit();
    await generateImage(edit);
    expect(forms[0].has("mask")).toBe(false);
  });

  it("refuses a mask on Gemini rather than repainting the whole picture", async () => {
    stubEdit();
    await expect(generateImage({ ...edit, provider: "gemini", mask: new Blob(["m"]) })).rejects.toThrow(/mask/);
  });
});

describe("generateImage — look style references (#1252)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const style = () => [new Blob(["s1"], { type: "image/webp" }), new Blob(["s2"], { type: "image/webp" })];
  const REFUSED = () => ({
    ok: false, status: 400,
    json: () => ({ error: { message: "rejected", code: "moderation_blocked" } }),
  });
  const imageCalls = (calls: Array<{ url: string; body: unknown }>) => calls.filter((c) => c.url.includes("/images/"));

  it("sends a plain generation, with no style sentence, when there are no style references", async () => {
    // Bug: the sentence appended unconditionally tells the model about images it was not given.
    const { admin } = fakeAdmin();
    const calls = stubFetch(OK_IMAGE);
    await generateImage(opts("openai", admin));
    const [call] = imageCalls(calls);
    expect(call.url).toContain("/images/generations");
    expect((call.body as { prompt: string }).prompt).toBe("a dwarven cleric");
  });

  it("names the style pictures in the prompt and sends them on the edits endpoint", async () => {
    // Bug: references attached but unexplained, so the model copies their subjects.
    const { admin } = fakeAdmin();
    const calls = stubFetch(OK_IMAGE);
    await generateImage({ ...opts("openai", admin), styleReferences: style() });
    const [call] = imageCalls(calls);
    expect(call.url).toContain("/images/edits");
    const form = call.body as FormData;
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(String(form.get("prompt"))).toMatch(/last 2 images are style references only/);
  });

  it("puts style pictures after the sources and counts only them in the sentence", async () => {
    // Bug: sentence says "last 3 images" when only the final two are style.
    const { admin } = fakeAdmin();
    const calls = stubFetch(OK_IMAGE);
    await generateImage({ ...opts("openai", admin), sourceImages: [new Blob(["src"], { type: "image/png" })], styleReferences: style() });
    const form = imageCalls(calls)[0].body as FormData;
    const names = form.getAll("image[]").map((f) => (f as File).name);
    expect(names).toEqual(["ref_0.png", "ref_1.webp", "ref_2.webp"]);
    expect(String(form.get("prompt"))).toMatch(/last 2 images/);
  });

  it("retries once as a plain generation without the pictures when only they sent it to the edits endpoint", async () => {
    // Bug: edits cannot take moderation: low, so a style-only edit refused a prompt a generation would allow.
    const { admin, updates } = fakeAdmin();
    let n = 0;
    const calls = stubFetch(() => (n++ === 0 ? REFUSED() : OK_IMAGE()));
    await generateImage({ ...opts("openai", admin), styleReferences: style() });
    const [first, second] = imageCalls(calls);
    expect(first.url).toContain("/images/edits");
    expect(second.url).toContain("/images/generations");
    expect(second.body).toMatchObject({ moderation: "low", prompt: "a dwarven cleric" });
    expect(updates).toEqual([{ id: "row-1", patch: { provider_outcome: "rendered" } }]);
  });

  it("does not drop the sources of a real edit when it is refused", async () => {
    // Bug: retrying a genuine edit without its pictures paints something else.
    const { admin } = fakeAdmin();
    const calls = stubFetch(REFUSED);
    const error = await generateImage({
      ...opts("openai", admin), sourceImages: [new Blob(["src"], { type: "image/png" })], styleReferences: style(),
    }).catch((e) => e);
    expect(isProviderRefusal(error)).toBe(true);
    expect(imageCalls(calls)).toHaveLength(1);
  });

  it("does not retry an outage, and a refusal of the retry is still logged as refused", async () => {
    // Bug: retrying every failure would double-bill an outage; a second refusal must reach the log.
    const outage = fakeAdmin();
    const outageCalls = stubFetch(() => ({ ok: false, status: 500, json: () => ({ error: { message: "x", code: "server_error" } }) }));
    await generateImage({ ...opts("openai", outage.admin), styleReferences: style() }).catch(() => undefined);
    expect(imageCalls(outageCalls)).toHaveLength(1);

    const refused = fakeAdmin();
    const refusedCalls = stubFetch(REFUSED);
    await generateImage({ ...opts("openai", refused.admin), styleReferences: style() }).catch(() => undefined);
    expect(imageCalls(refusedCalls)).toHaveLength(2);
    expect(refused.updates[0].patch.provider_outcome).toBe("refused");
  });

  it("hands Gemini the pictures inline after the prompt, with the sentence", async () => {
    const { admin } = fakeAdmin();
    const calls = stubFetch(() => ({ ok: true, json: () => ({ candidates: [{ content: { parts: [{ inlineData: { data: "aGk=", mimeType: "image/png" } }] } }] }) }));
    await generateImage({ ...opts("gemini", admin), styleReferences: style() });
    const parts = (calls.find((c) => c.url.includes("generativelanguage"))!.body as { contents: Array<{ parts: Array<{ text?: string; inline_data?: unknown }> }> }).contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0].text).toMatch(/style references only/);
  });

  it("does not retry a Gemini refusal, which takes the pictures inline either way", async () => {
    // Bug: the retry dropped the look pictures on a provider whose moderation does not depend on them.
    const { admin } = fakeAdmin();
    const calls = stubFetch(() => ({ ok: true, json: () => ({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }) }));
    await generateImage({ ...opts("gemini", admin), styleReferences: style() }).catch(() => undefined);
    expect(calls.filter((c) => c.url.includes("generativelanguage"))).toHaveLength(1);
  });

  it("caps style references at four", async () => {
    // Bug: an unbounded list bills every extra picture as image input.
    const { admin } = fakeAdmin();
    const calls = stubFetch(OK_IMAGE);
    const six = Array.from({ length: 6 }, () => new Blob(["s"], { type: "image/webp" }));
    await generateImage({ ...opts("openai", admin), styleReferences: six });
    expect((imageCalls(calls)[0].body as FormData).getAll("image[]")).toHaveLength(4);
  });
});
