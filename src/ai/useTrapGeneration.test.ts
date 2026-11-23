import { describe, expect, it, vi } from "vitest";
import { useTrapGeneration } from "./useTrapGeneration";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/ai/localKeyMode", () => ({ textRunsOnLocalKey: async () => false }));
vi.mock("@/composables/rules/useRuleset", () => ({
  useTableRuleset: () => ({ ruleset: { value: "2024" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ logUsage: vi.fn() }));
vi.mock("@/composables/ai/useLikenessGate", () => ({
  useLikenessGate: () => ({ ensureLikenessAck: async () => true }),
}));
vi.mock("@/ai/useImageGeneration", () => ({
  captureFailureMessage: () => "capture failed",
  captureImageGenerationContext: async () => ({ campaignId: "campaign-1" }),
  generateImage: vi.fn(),
}));

describe("useTrapGeneration server call", () => {
  it("a text function quietly painting a second, unrecorded picture: the call never asks the function for one", async () => {
    mocks.invoke.mockResolvedValue({ data: { name: "Pit", image_prompt: "" }, error: null });

    await useTrapGeneration().generate("a pit trap", { generateImage: false });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fn, call] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("generate-trap");
    expect(call.body).not.toHaveProperty("generate_image");
    expect(call.body).not.toHaveProperty("group_portrait_url");
  });
});
