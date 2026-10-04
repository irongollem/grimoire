import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLegalTab from "./AdminLegalTab.vue";
import type { TermsNoticeStatus } from "@/composables/admin/useTermsNotice";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  mutateAsync: vi.fn(),
}));

const status = ref<TermsNoticeStatus | undefined>();
const runData = ref<TermsNoticeStatus | undefined>();

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/lib/legal", () => ({ TERMS_VERSION: "2026-09-28" }));
vi.mock("@/composables/admin/useTermsNotice", () => ({
  useTermsNoticeStatus: () => ({
    data: status,
    isPending: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  }),
  useSendTermsNotice: () => ({
    data: runData,
    isPending: ref(false),
    mutateAsync: mocks.mutateAsync,
  }),
}));

function base(overrides: Partial<TermsNoticeStatus> = {}): TermsNoticeStatus {
  return {
    configured: true,
    version: "2026-09-28",
    changes: ["First change.", "Second change."],
    pending: 12,
    alreadyAccepted: 8,
    alreadyNotified: 3,
    sent: 0,
    failed: 0,
    remaining: 0,
    batchSize: 50,
    ...overrides,
  };
}

function button(wrapper: ReturnType<typeof mount>) {
  return wrapper.find("button");
}

describe("AdminLegalTab", () => {
  beforeEach(() => {
    mocks.confirm.mockReset();
    mocks.mutateAsync.mockReset();
    runData.value = undefined;
    status.value = base();
  });

  it("shows the version, the changes and the counts in words", () => {
    const w = mount(AdminLegalTab);
    expect(w.text()).toContain("2026-09-28");
    expect(w.text()).toContain("First change.");
    const counts = w.get('[data-testid="terms-counts"]').text();
    expect(counts).toContain("12 accounts have not accepted this version");
    expect(counts).toContain("8 accepted it in the app");
    expect(counts).toContain("3 were already emailed");
    expect(button(w).text()).toContain("Email 12 accounts");
    expect(button(w).attributes("disabled")).toBeUndefined();
  });

  it("disables the button when nobody is pending", () => {
    status.value = base({ pending: 0 });
    const w = mount(AdminLegalTab);
    expect(w.text()).toContain("Everyone has accepted or been emailed");
    expect(button(w).attributes("disabled")).toBeDefined();
  });

  it("disables the button and warns when email is not configured", () => {
    status.value = base({ configured: false });
    const w = mount(AdminLegalTab);
    expect(w.text()).toContain("Email is not set up");
    expect(button(w).attributes("disabled")).toBeDefined();
  });

  it("does not send when the confirmation is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mount(AdminLegalTab);
    await button(w).trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Email 12 accounts about the Terms of Service updated on 2026-09-28?"),
      expect.anything(),
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("sends once confirmed", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.mutateAsync.mockResolvedValue(base());
    const w = mount(AdminLegalTab);
    await button(w).trigger("click");
    await flushPromises();
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("offers the next batch and reports sent and failed after a run", () => {
    runData.value = base({ pending: 70, sent: 49, failed: 1, remaining: 70 });
    status.value = runData.value;
    const w = mount(AdminLegalTab);
    expect(w.get('[data-testid="terms-last-run"]').text()).toBe("Sent 49, 1 failed.");
    expect(button(w).text()).toContain("Send the next 50");
  });
});
