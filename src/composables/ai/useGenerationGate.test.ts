import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaResource } from "@/types/subscription.types";

const canCreate = ref(true);
const useQuotaMock = vi.fn((_resource: QuotaResource) => ({ canCreate, quota: ref(null) }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: (resource: QuotaResource) => useQuotaMock(resource),
}));

const requireCredits = vi.fn<(cost: number, byok?: boolean) => boolean>();
vi.mock("@/composables/ai/useOutOfCredits", () => ({
  useOutOfCredits: () => ({ requireCredits }),
}));

const isQuotaExceeded = vi.fn<(error: unknown) => boolean>();
vi.mock("@/lib/quotaError", () => ({ isQuotaExceeded }));

const { useGenerationGate } = await import("./useGenerationGate");

describe("useGenerationGate", () => {
  beforeEach(() => {
    canCreate.value = true;
    useQuotaMock.mockClear();
    requireCredits.mockReset().mockReturnValue(true);
    isQuotaExceeded.mockReset().mockReturnValue(false);
  });

  describe("without a resource — credit gate only", () => {
    it("never touches useQuota", () => {
      useGenerationGate();
      expect(useQuotaMock).not.toHaveBeenCalled();
    });

    it("lets an affordable spend through", () => {
      requireCredits.mockReturnValue(true);
      const { canSpend, showQuotaPaywall } = useGenerationGate();
      expect(canSpend(5)).toBe(true);
      expect(showQuotaPaywall.value).toBe(false);
    });

    it("blocks on the credit gate when short, without opening the quota paywall", () => {
      requireCredits.mockReturnValue(false);
      const { canSpend, showQuotaPaywall } = useGenerationGate();
      expect(canSpend(5)).toBe(false);
      expect(showQuotaPaywall.value).toBe(false);
    });
  });

  describe("with a resource — quota checked before credits", () => {
    it("opens the quota paywall and never calls requireCredits when at the limit", () => {
      canCreate.value = false;
      const { canSpend, showQuotaPaywall } = useGenerationGate("npcs");

      expect(canSpend(5)).toBe(false);
      expect(showQuotaPaywall.value).toBe(true);
      expect(requireCredits).not.toHaveBeenCalled();
    });

    it("falls through to the credit gate when under quota", () => {
      canCreate.value = true;
      requireCredits.mockReturnValue(true);
      const { canSpend, showQuotaPaywall } = useGenerationGate("npcs");

      expect(canSpend(5, true)).toBe(true);
      expect(requireCredits).toHaveBeenCalledWith(5, true);
      expect(showQuotaPaywall.value).toBe(false);
    });

    it("blocks on a short balance under quota, without opening the quota paywall", () => {
      canCreate.value = true;
      requireCredits.mockReturnValue(false);
      const { canSpend, showQuotaPaywall } = useGenerationGate("npcs");

      expect(canSpend(5)).toBe(false);
      expect(showQuotaPaywall.value).toBe(false);
    });

    it("queries useQuota for the given resource", () => {
      useGenerationGate("monsters");
      expect(useQuotaMock).toHaveBeenCalledWith("monsters");
    });
  });

  describe("gateQuotaError", () => {
    it("opens the paywall and reports handled on a quota_exceeded error", () => {
      isQuotaExceeded.mockReturnValue(true);
      const { gateQuotaError, showQuotaPaywall } = useGenerationGate("npcs");

      expect(gateQuotaError(new Error("quota_exceeded"))).toBe(true);
      expect(showQuotaPaywall.value).toBe(true);
    });

    it("reports unhandled and leaves the paywall closed on any other error", () => {
      isQuotaExceeded.mockReturnValue(false);
      const { gateQuotaError, showQuotaPaywall } = useGenerationGate("npcs");

      expect(gateQuotaError(new Error("boom"))).toBe(false);
      expect(showQuotaPaywall.value).toBe(false);
    });

    it("works without a resource too", () => {
      isQuotaExceeded.mockReturnValue(true);
      const { gateQuotaError, showQuotaPaywall } = useGenerationGate();

      expect(gateQuotaError("anything")).toBe(true);
      expect(showQuotaPaywall.value).toBe(true);
    });
  });
});
