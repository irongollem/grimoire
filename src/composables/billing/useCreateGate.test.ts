import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaResource } from "@/types/subscription.types";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

const canCreate = ref(true);
const useQuotaMock = vi.fn((_resource: QuotaResource) => ({ canCreate }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: (resource: QuotaResource) => useQuotaMock(resource),
}));

const isQuotaExceeded = vi.fn<(error: unknown) => boolean>();
vi.mock("@/lib/quotaError", () => ({ isQuotaExceeded }));

const { useCreateGate } = await import("./useCreateGate");

describe("useCreateGate", () => {
  beforeEach(() => {
    push.mockReset();
    canCreate.value = true;
    useQuotaMock.mockClear();
    isQuotaExceeded.mockReset().mockReturnValue(false);
  });

  it("queries useQuota for the given resource", () => {
    useCreateGate("npcs", "/npcs/new");
    expect(useQuotaMock).toHaveBeenCalledWith("npcs");
  });

  describe("handleNew", () => {
    it("navigates to the new route when under quota", () => {
      canCreate.value = true;
      const { handleNew, showPaywall } = useCreateGate("npcs", "/npcs/new");

      handleNew();

      expect(push).toHaveBeenCalledWith("/npcs/new");
      expect(showPaywall.value).toBe(false);
    });

    it("opens the paywall instead of navigating when at the limit", () => {
      canCreate.value = false;
      const { handleNew, showPaywall } = useCreateGate("npcs", "/npcs/new");

      handleNew();

      expect(push).not.toHaveBeenCalled();
      expect(showPaywall.value).toBe(true);
    });
  });

  describe("gateQuotaError", () => {
    it("opens the paywall and reports handled on a quota_exceeded error", () => {
      isQuotaExceeded.mockReturnValue(true);
      const { gateQuotaError, showPaywall } = useCreateGate("npcs", "/npcs/new");

      expect(gateQuotaError(new Error("quota_exceeded"))).toBe(true);
      expect(showPaywall.value).toBe(true);
    });

    it("reports unhandled and leaves the paywall closed on any other error", () => {
      isQuotaExceeded.mockReturnValue(false);
      const { gateQuotaError, showPaywall } = useCreateGate("npcs", "/npcs/new");

      expect(gateQuotaError(new Error("boom"))).toBe(false);
      expect(showPaywall.value).toBe(false);
    });
  });
});
