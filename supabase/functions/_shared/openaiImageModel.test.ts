import { describe, it, expect } from "vitest";
import { isFlexibleOpenAiModel } from "./openaiImageModel.ts";

describe("isFlexibleOpenAiModel", () => {
  it("treats the gpt-image-2.5 family as flexible", () => {
    expect(isFlexibleOpenAiModel("gpt-image-2.5-flare")).toBe(true);
    expect(isFlexibleOpenAiModel("gpt-image-2.5")).toBe(true);
  });

  it("treats every other OpenAI model as fixed-size, including gpt-image-2's own name", () => {
    expect(isFlexibleOpenAiModel("gpt-image-2")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-1")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-1.5")).toBe(false);
    expect(isFlexibleOpenAiModel("gpt-image-3")).toBe(false);
  });
});
