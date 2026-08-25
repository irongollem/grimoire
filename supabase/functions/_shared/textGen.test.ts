import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEXT_MODELS,
  anthropicText,
  geminiText,
  openaiText,
  openaiReasoningParams,
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
