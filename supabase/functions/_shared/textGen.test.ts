import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEXT_MODELS,
  anthropicText,
  geminiText,
  openaiText,
  openaiReasoningParams,
  resolveTextProvider,
} from "./textGen";

afterEach(() => vi.unstubAllGlobals());

function stubJsonResponse(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
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
  it("uses Luna as the platform fallback and low reasoning for the 5.6 family", () => {
    expect(DEFAULT_TEXT_MODELS.openai).toBe("gpt-5.6-luna");
    expect(openaiReasoningParams("gpt-5.6-luna")).toEqual({ reasoning_effort: "low" });
    expect(openaiReasoningParams("gpt-5.6-terra")).toEqual({ reasoning_effort: "low" });
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

  it("runs on the only key the DM holds, whichever provider text_provider names", () => {
    const text = resolveTextProvider({ chosen: "openai", campaignKeys: { gemini: "g-own" }, platformKeys, providerConfigs });
    expect(text).toMatchObject({ provider: "gemini", apiKey: "g-own", isByok: true });
  });

  it("does not bill credits to a DM with a key when text_provider was never saved", () => {
    const text = resolveTextProvider({ chosen: null, campaignKeys: { openai: "sk-own" }, platformKeys, providerConfigs });
    expect(text).toMatchObject({ provider: "openai", apiKey: "sk-own", isByok: true });
  });

  it("lets text_provider pick between two keys the DM holds", () => {
    const text = resolveTextProvider({ chosen: "gemini", campaignKeys: { openai: "sk-own", gemini: "g-own" }, platformKeys, providerConfigs });
    expect(text).toMatchObject({ provider: "gemini", apiKey: "g-own", isByok: true });
  });

  it("finds nothing when no provider is enabled with a key", () => {
    const allOff = { openai: { ...providerConfigs.openai, text_enabled: false }, gemini: providerConfigs.gemini };
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys, providerConfigs: allOff })).toBeNull();
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys: {}, providerConfigs })).toBeNull();
  });

  it("skips an enabled provider with no model set", () => {
    const noModel = { openai: { text_model: null, text_enabled: true }, gemini: { text_model: "gemini-2.5-flash", text_enabled: true } };
    expect(resolveTextProvider({ chosen: null, campaignKeys: {}, platformKeys, providerConfigs: noModel })?.provider).toBe("gemini");
  });
});
