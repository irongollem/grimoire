import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake, store } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return {
    fake: createSupabaseFake(),
    store: {
      activeCampaign: { text_provider: "openai", image_provider: "openai" } as Record<string, string>,
      decryptedOpenAiKey: null as string | null,
      decryptedAnthropicKey: null as string | null,
      decryptedGeminiKey: null as string | null,
    },
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));

import { getTextProvider } from "./index";

const fetchMock = vi.fn();

function answerWith(body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
}

function sentBody(): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

beforeEach(() => {
  fake.reset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(store, { decryptedOpenAiKey: null, decryptedAnthropicKey: null, decryptedGeminiKey: null });
});

describe("the browser's own-key text path follows Admin → Providers", () => {
  // Bug: the browser path named its own models (gpt-6-luna, claude-sonnet-4-6, gemini-3.1-flash), so the admin setting never reached it.
  it("calls OpenAI with the configured text model and reports it in usage", async () => {
    fake.seed("provider_config", [{ provider: "openai", text_model: "gpt-6-terra" }]);
    store.activeCampaign = { text_provider: "openai" };
    store.decryptedOpenAiKey = "sk-own";
    answerWith({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });

    const result = await getTextProvider().complete("system", "user");

    expect(sentBody()).toMatchObject({ model: "gpt-6-terra", reasoning_effort: "low" });
    expect(result.usage.model).toBe("gpt-6-terra");
  });

  it("calls Anthropic with the configured text model", async () => {
    fake.seed("provider_config", [{ provider: "anthropic", text_model: "claude-haiku-4-5" }]);
    store.activeCampaign = { text_provider: "anthropic" };
    store.decryptedAnthropicKey = "sk-ant";
    answerWith({ content: [{ text: "{}" }], usage: { input_tokens: 3, output_tokens: 2 } });

    await getTextProvider().complete("system", "user");

    expect(sentBody()).toMatchObject({ model: "claude-haiku-4-5" });
  });

  it("sends no reasoning effort to an OpenAI model outside the reasoning families", async () => {
    fake.seed("provider_config", [{ provider: "openai", text_model: "gpt-4.1-mini" }]);
    store.activeCampaign = { text_provider: "openai" };
    store.decryptedOpenAiKey = "sk-own";
    answerWith({ choices: [{ message: { content: "{}" } }], usage: {} });

    await getTextProvider().complete("system", "user");

    expect(sentBody()).not.toHaveProperty("reasoning_effort");
  });

  it("says where to set a model when none is configured, and calls nobody", async () => {
    fake.seed("provider_config", [{ provider: "openai", text_model: null }]);
    store.activeCampaign = { text_provider: "openai" };
    store.decryptedOpenAiKey = "sk-own";

    await expect(getTextProvider().complete("system", "user")).rejects.toThrow(/Admin → Providers/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
