import { beforeEach, describe, expect, it, vi } from "vitest";

const useAiCreditsSpy = vi.fn();
const affordable = vi.fn<(credits: number, byok?: boolean) => boolean>();
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => {
    useAiCreditsSpy();
    return { affordable };
  },
}));

const { useOutOfCredits, outOfCreditsNeeded } = await import("./useOutOfCredits");

describe("useOutOfCredits", () => {
  beforeEach(() => {
    affordable.mockReset();
    useOutOfCredits().closeOutOfCredits();
  });

  it("lets an affordable action run without opening the dialog", () => {
    affordable.mockReturnValue(true);
    const { requireCredits, needed } = useOutOfCredits();
    expect(requireCredits(4)).toBe(true);
    expect(needed.value).toBeNull();
  });

  it("blocks an unaffordable action and opens the dialog with its cost", () => {
    affordable.mockReturnValue(false);
    const { requireCredits, needed } = useOutOfCredits();
    expect(requireCredits(12)).toBe(false);
    expect(needed.value).toBe(12);
  });

  it("passes BYOK through, so an own-key action is never blocked on credits", () => {
    affordable.mockImplementation((_credits, byok) => byok === true);
    expect(useOutOfCredits().requireCredits(12, true)).toBe(true);
  });

  it("shares one dialog between every caller", () => {
    affordable.mockReturnValue(false);
    useOutOfCredits().requireCredits(3);
    expect(useOutOfCredits().needed.value).toBe(3);
  });

  it("exposes the open state without subscribing to the credit queries (#999)", () => {
    useAiCreditsSpy.mockClear();
    affordable.mockReturnValue(false);
    expect(outOfCreditsNeeded.value).toBeNull();
    useOutOfCredits().requireCredits(5);
    useAiCreditsSpy.mockClear();
    expect(outOfCreditsNeeded.value).toBe(5);
    expect(useAiCreditsSpy).not.toHaveBeenCalled();
  });
});
