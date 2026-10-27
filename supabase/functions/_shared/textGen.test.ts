import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEXT_MODELS,
  anthropicText,
  callText,
  type ResolvedTextProvider,
  geminiText,
  openaiText,
  openaiReasoningParams,
  resolveTextProvider,
} from "./textGen";

afterEach(() => vi.unstubAllGlobals());

function stubJsonResponse(body: unknown) {
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    requestBody: () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
  };
}

describe("OpenAI text generation", () => {
  it("asks for low reasoning effort across the 5.6 family and no other", () => {
    expect(openaiReasoningParams("gpt-5.6-luna")).toEqual({ reasoning_effort: "low" });
    expect(openaiReasoningParams("gpt-5.6-terra")).toEqual({ reasoning_effort: "low" });
    expect(openaiReasoningParams("gpt-5.6")).toEqual({ reasoning_effort: "low" });
    expect(openaiReasoningParams("gpt-5.60")).toEqual({});
  });

  it("sends Luna-compatible JSON and completion-budget parameters", async () => {
    const { requestBody } = stubJsonResponse({
      choices: [{ message: { content: "{}" } }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    });

    await openaiText("sk-test", "gpt-5.6-luna", "system", "user", 4096);

    expect(requestBody()).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });
  });

  it("does not send reasoning effort to older BYOK models", async () => {
    const { requestBody } = stubJsonResponse({
      choices: [{ message: { content: "{}" } }],
      usage: {},
    });

    await openaiText("sk-test", "gpt-4o-mini", "system", "user");

    expect(requestBody()).not.toHaveProperty("reasoning_effort");
  });

  it("keeps plain-text calls out of JSON mode", async () => {
    const { requestBody } = stubJsonResponse({
      choices: [{ message: { content: "A markdown chronicle" } }],
      usage: {},
    });

    await openaiText("sk-test", "gpt-5.6-luna", "system", "user", 8192, "text");

    expect(requestBody()).not.toHaveProperty("response_format");
  });
});

describe("provider failures", () => {
  it.each([
    ["OpenAI", () => openaiText("k", "m", "s", "u")],
    ["Anthropic", () => anthropicText("k", "m", "s", "u")],
    ["Gemini", () => geminiText("k", "m", "s", "u")],
  ])("%s: surfaces the provider's own message, or the status when it sent none", async (_name, call) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota exhausted" } }), { status: 429 })));
    await expect(call()).rejects.toThrow("quota exhausted");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(call()).rejects.toThrow("502");
  });
});

describe("callText", () => {
  const text = (provider: ResolvedTextProvider["provider"]): ResolvedTextProvider =>
    ({ provider, apiKey: "key-1", isByok: false, config: undefined, textMultiplier: 1 });
  const answers = {
    openai: { choices: [{ message: { content: "{}" } }], usage: {} },
    anthropic: { content: [{ text: "{}" }], usage: {} },
    gemini: { candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: {} },
  };

  it.each(["openai", "anthropic", "gemini"] as const)("%s: calls the chosen provider with its default model unless a model is given", async (provider) => {
    const { fetchMock, requestBody } = stubJsonResponse(answers[provider]);
    const result = await callText({ text: text(provider), system: "s", user: "u" });
    expect(result.usage).toMatchObject({ provider: provider === "gemini" ? "google" : provider, model: DEFAULT_TEXT_MODELS[provider] });
    if (provider === "gemini") expect(String(fetchMock.mock.calls[0][0])).toContain(`models/${DEFAULT_TEXT_MODELS.gemini}:`);
    else expect(requestBody().model).toBe(DEFAULT_TEXT_MODELS[provider]);

    stubJsonResponse(answers[provider]);
    const explicit = await callText({ text: text(provider), model: "custom-model", system: "s", user: "u" });
    expect(explicit.usage.model).toBe("custom-model");
  });
});

describe("JSON mode", () => {
  it("tells Anthropic, which has no JSON mode, to answer in JSON only, after the caller's own system prompt", async () => {
    const { requestBody } = stubJsonResponse({ content: [{ text: "{}" }], usage: {} });
    await anthropicText("key", "claude-test", "my system prompt", "user");
    const system = requestBody().system as string;
    expect(system.startsWith("my system prompt")).toBe(true);
    expect(system.length).toBeGreaterThan("my system prompt".length);
  });
});

describe("plain-text provider mode", () => {
  it("does not append the JSON-only instruction for Anthropic", async () => {
    const { requestBody } = stubJsonResponse({
      content: [{ text: "plain" }],
      usage: {},
    });

    await anthropicText("key", "claude-test", "system", "user", 1024, "text");

    expect(requestBody().system).toBe("system");
  });

  it("does not request the JSON MIME type from Gemini", async () => {
    const { requestBody } = stubJsonResponse({
      candidates: [{ content: { parts: [{ text: "plain" }] } }],
      usageMetadata: {},
    });

    await geminiText("key", "gemini-test", "system", "user", 1024, "text");

    expect(requestBody().generationConfig).toEqual({ maxOutputTokens: 1024 });
  });
});

describe("resolveTextProvider — the platform picks the model, not the DM", () => {
  const platformKeys = { openai: "sk-platform", gemini: "g-platform" };
  const providerConfigs = {
    openai: { text_model: "gpt-5.6-luna", text_enabled: true, text_multiplier: 1 },
    gemini: { text_model: "gemini-2.5-flash", text_enabled: false, text_multiplier: 3.8 },
  };

  it("runs a platform-credit campaign on the enabled provider whatever text_provider says", () => {
    const text = resolveTextProvider({ chosen: "gemini", campaignKeys: {}, platformKeys, providerConfigs });
    expect(text).toMatchObject({ provider: "openai", apiKey: "sk-platform", isByok: false, textMultiplier: 1 });
  });

  it("runs on the DM's own key for the provider they chose", () => {
    const text = resolveTextProvider({ chosen: "gemini", campaignKeys: { gemini: "g-own" }, platformKeys, providerConfigs });
    expect(text).toMatchObject({ provider: "gemini", apiKey: "g-own", isByok: true });
    expect(text?.config?.text_model).toBe("gemini-2.5-flash");
  });

  it("prices at one credit per credit when the provider's multiplier is unset", () => {
    const unset = { openai: { text_model: "gpt-5.6-luna", text_enabled: true } };
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys, providerConfigs: unset })?.textMultiplier).toBe(1);
  });

  it("finds nothing when no provider is enabled with a key", () => {
    const allOff = { openai: { ...providerConfigs.openai, text_enabled: false }, gemini: providerConfigs.gemini };
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys, providerConfigs: allOff })).toBeNull();
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys: {}, providerConfigs })).toBeNull();
  });
});
