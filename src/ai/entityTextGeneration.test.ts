import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateEntityText, generateProseText } from "./entityTextGeneration";
import type { AiProvenance } from "@/ai/provenance";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@edge-shared/edgeError.ts", () => ({ edgeErrorMessage: async () => "edge failed" }));

const base = { campaignId: "c1", prompt: "He was sad.", constraints: ["Context: note"] };

beforeEach(() => {
  invoke.mockReset();
});

describe("generateProseText", () => {
  // Bug caught: prose returned as the raw response object, or the request body missing the campaign or constraints.
  it("goes through generate-entity-text on credits and returns the prose", async () => {
    invoke.mockResolvedValue({ data: { content: "Rewritten.", ai_provenance: {} }, error: null });
    const out = await generateProseText({ ...base, generator: "text_enhancement" });
    expect(out).toBe("Rewritten.");
    expect(invoke).toHaveBeenCalledWith("generate-entity-text", {
      body: { campaign_id: "c1", generator: "text_enhancement", prompt: "He was sad.", constraints: ["Context: note"] },
    });
  });
});

describe("generateEntityText", () => {
  // Bug caught: a 200 response carrying `error` being treated as a draft.
  it("surfaces an error the function reports in a 200 response", async () => {
    invoke.mockResolvedValue({ data: { error: "Not enough credits." }, error: null });
    await expect(generateEntityText({ ...base, generator: "puzzle" })).rejects.toThrow("Not enough credits.");
  });

  // Bug caught: a transport error swallowed or thrown without the edge function's message.
  it("surfaces a transport error through the edge error message", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(generateEntityText({ ...base, generator: "puzzle" })).rejects.toThrow("edge failed");
  });

  // Bug caught: the server's provenance dropped from the returned draft.
  it("returns the draft with the provenance the server attached", async () => {
    invoke.mockResolvedValue({ data: { name: "Riddle", ai_provenance: { generatorType: "puzzle_generation" } }, error: null });
    const out = await generateEntityText<{ name: string; ai_provenance?: AiProvenance }>({ ...base, generator: "puzzle" });
    expect(out.name).toBe("Riddle");
    expect(out.ai_provenance).toMatchObject({ generatorType: "puzzle_generation" });
  });
});
