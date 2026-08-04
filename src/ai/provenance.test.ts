import { describe, it, expect } from "vitest";
import { buildAiProvenance } from "./provenance";

describe("buildAiProvenance", () => {
  it("builds the AiProvenance shape from the given generator/provider/model", () => {
    const result = buildAiProvenance("npc_text", "openai", "gpt-4.1");
    expect(result.generatorType).toBe("npc_text");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4.1");
    expect(result.edited).toBe(false);
  });

  it("stamps generatedAt as a valid ISO 8601 timestamp", () => {
    const before = Date.now();
    const result = buildAiProvenance("monster_generation", "anthropic", "claude-sonnet-5");
    const after = Date.now();
    const stamped = new Date(result.generatedAt).getTime();
    expect(result.generatedAt).toBe(new Date(stamped).toISOString());
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("always starts unedited", () => {
    expect(buildAiProvenance("quest_generation", "gemini", "gemini-2.5-flash").edited).toBe(false);
  });
});
