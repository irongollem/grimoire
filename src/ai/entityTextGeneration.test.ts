import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateEntityText, generateProseText } from "./entityTextGeneration";
import type { AiProvenance } from "@/ai/provenance";

const invoke = vi.fn();
const complete = vi.fn();
const logUsage = vi.fn();

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@edge-shared/edgeError.ts", () => ({ edgeErrorMessage: async () => "edge failed" }));
vi.mock("./providers", () => ({ getTextProvider: () => ({ complete }) }));
vi.mock("./systemPrompts", () => ({
  fetchSystemPrompt: async (key: string) => `PROMPT:${key}`,
  fetchRulesetContext: async () => null,
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ logUsage: (...a: unknown[]) => logUsage(...a) }));

const usage = { provider: "openai", model: "m", input_tokens: 1, output_tokens: 1 };
const base = { campaignId: "c1", settingPrompt: null, ruleset: "2024" as const, prompt: "He was sad.", constraints: ["Context: note"] };

// Local mode is decided by textRunsOnLocalKey: chosen AND a key that decrypted.
let localKeyUsable = false;
vi.mock("@/ai/localKeyMode", () => ({ textRunsOnLocalKey: async () => localKeyUsable }));
function setLocalMode(local: boolean) {
  localKeyUsable = local;
}

beforeEach(() => {
  invoke.mockReset();
  complete.mockReset();
  logUsage.mockReset();
});
afterEach(() => setLocalMode(false));

describe("generateProseText", () => {
  it("goes through generate-entity-text on credits and returns the prose", async () => {
    invoke.mockResolvedValue({ data: { content: "Rewritten.", ai_provenance: {} }, error: null });
    const out = await generateProseText({ ...base, generator: "text_enhancement" });
    expect(out).toBe("Rewritten.");
    expect(invoke).toHaveBeenCalledWith("generate-entity-text", {
      body: { campaign_id: "c1", generator: "text_enhancement", prompt: "He was sad.", constraints: ["Context: note"] },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("in local-key mode asks the provider for prose, not JSON, under the historical ledger reason", async () => {
    setLocalMode(true);
    complete.mockResolvedValue({ content: "  Rewritten.\n", usage });
    const out = await generateProseText({ ...base, generator: "text_enhancement" });
    expect(out).toBe("Rewritten.");
    expect(complete).toHaveBeenCalledWith(expect.stringContaining("PROMPT:text_enhancement"), expect.any(String), "text");
    expect(logUsage).toHaveBeenCalledWith({ reason: "text_enhancement", textUsage: usage });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("generateEntityText", () => {
  it("in local-key mode still asks for JSON and charges `<generator>_generation`", async () => {
    setLocalMode(true);
    complete.mockResolvedValue({ content: '{"name":"Riddle"}', usage });
    const out = await generateEntityText<{ name: string; ai_provenance?: AiProvenance }>({ ...base, generator: "puzzle" });
    expect(out.name).toBe("Riddle");
    expect(out.ai_provenance).toMatchObject({ generatorType: "puzzle_generation" });
    expect(complete).toHaveBeenCalledWith(expect.any(String), expect.any(String), "json");
    expect(logUsage).toHaveBeenCalledWith({ reason: "puzzle_generation", textUsage: usage });
  });

  it("falls back to the server when local mode has no usable key (#1043)", async () => {
    setLocalMode(false);
    invoke.mockResolvedValue({ data: { name: "Riddle", ai_provenance: {} }, error: null });
    const out = await generateEntityText<{ name: string; ai_provenance?: AiProvenance }>({ ...base, generator: "puzzle" });
    expect(out.name).toBe("Riddle");
    expect(complete).not.toHaveBeenCalled();
  });
});
