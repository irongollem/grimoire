import { beforeEach, describe, expect, it, vi } from "vitest";

const affordable = vi.fn<(credits: number, byok?: boolean) => boolean>();
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ affordable }),
}));

const { useOutOfCredits } = await import("./useOutOfCredits");

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
});
