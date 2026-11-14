import { describe, expect, it, vi } from "vitest";
import { sizeMultiplier } from "@edge-shared/credit-math.ts";

const mocks = vi.hoisted(() => ({
  base: new Map<string, number>(),
  multiplier: vi.fn(),
}));

// The real costOf (base × size multiplier, whole credits) over a mocked price row, so the test
// fails if the doll stops passing its sheet size as well as if it drops the provider multiplier.
vi.mock("@/composables/ai/useAiCredits", async () => {
  const { wholeCredits, sizeMultiplier: size } = await import("@edge-shared/credit-math.ts");
  return {
    useAiCredits: () => ({
      costOf: (type: string, opts?: { size?: string | null }) => wholeCredits((mocks.base.get(type) ?? 1) * size(opts?.size)),
    }),
  };
});
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: mocks.multiplier }) }));

import { useCharacterDollCost } from "./useCharacterDoll";

describe("useCharacterDollCost", () => {
  it("prices a doll as its base at the 1536x1024 sheet size times the OpenAI image multiplier, as the server charges", () => {
    mocks.base.set("character_doll", 150);
    mocks.multiplier.mockReturnValue(0.35);

    expect(sizeMultiplier("1536x1024")).toBe(1.5);
    expect(useCharacterDollCost().value).toBe(79); // 150 × 1.5 = 225, × 0.35 = 78.75, rounded up
    expect(mocks.multiplier).toHaveBeenCalledWith("openai");
  });
});
