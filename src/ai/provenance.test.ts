import { describe, it, expect } from "vitest";
import { buildAiProvenance, markEdited } from "./provenance";

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

describe("markEdited", () => {
  it("returns null for null", () => {
    expect(markEdited(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(markEdited(undefined)).toBeNull();
  });

  it("flips edited from false to true, preserving the rest of the record", () => {
    const prov = buildAiProvenance("npc_text", "openai", "gpt-4.1");
    const result = markEdited(prov);
    expect(result).not.toBeNull();
    expect(result?.edited).toBe(true);
    expect(result?.generatorType).toBe(prov.generatorType);
    expect(result?.provider).toBe(prov.provider);
    expect(result?.model).toBe(prov.model);
    expect(result?.generatedAt).toBe(prov.generatedAt);
  });

  it("returns the same object unchanged (no new identity) when already edited", () => {
    const prov = { ...buildAiProvenance("npc_text", "openai", "gpt-4.1"), edited: true };
    const result = markEdited(prov);
    expect(result).toBe(prov);
  });

  it("never reverts edited back to false", () => {
    const prov = { ...buildAiProvenance("npc_text", "openai", "gpt-4.1"), edited: true };
    const result = markEdited(prov);
    expect(result?.edited).toBe(true);
  });
});
