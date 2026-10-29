import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

const { useCopyDialog } = await import("./useCopyDialog");

describe("useCopyDialog", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
  });

  it("finish toasts the message and closes the dialog", () => {
    const dialog = useCopyDialog();
    dialog.copyOpen.value = true;

    dialog.finish("Copied it.");

    expect(toastSuccess).toHaveBeenCalledWith("Copied it.");
    expect(dialog.copyOpen.value).toBe(false);
  });

  it("onQuotaExceeded closes the dialog and does not toast", () => {
    const dialog = useCopyDialog();
    dialog.copyOpen.value = true;

    dialog.onQuotaExceeded();

    expect(dialog.copyOpen.value).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("onQuotaExceeded invokes the caller's callback, for surfaces with a paywall", () => {
    const onQuotaExceeded = vi.fn();
    useCopyDialog({ onQuotaExceeded }).onQuotaExceeded();
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });

  it("onQuotaExceeded is safe with no callback, for surfaces without a paywall", () => {
    expect(() => useCopyDialog().onQuotaExceeded()).not.toThrow();
  });
});
