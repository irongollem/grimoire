import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";
import { useSendTermsNotice, useTermsNoticeStatus, type TermsNoticeStatus } from "./useTermsNotice";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const STATUS: TermsNoticeStatus = {
  configured: true,
  version: "2026-09-28",
  changes: ["a"],
  pending: 3,
  alreadyAccepted: 2,
  alreadyNotified: 1,
  sent: 0,
  failed: 0,
  previouslyFailed: 0,
  batchSize: 50,
};

function run<T>(setup: () => T): { result: T; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const app = createApp(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return { result, qc };
}

describe("useTermsNotice", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("runs a dry run for the status", async () => {
    mocks.invoke.mockResolvedValue({ data: STATUS, error: null });
    const { result } = run(() => useTermsNoticeStatus());
    await vi.waitFor(() => expect(result.data.value).toEqual(STATUS));
    expect(mocks.invoke).toHaveBeenCalledWith("send-terms-notice", { body: { dryRun: true } });
  });

  it("surfaces an invoke error", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("nope") });
    const { result } = run(() => useTermsNoticeStatus());
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
  });

  it("sends for real and replaces the status with the response", async () => {
    const after = { ...STATUS, pending: 0, alreadyNotified: 4, sent: 3 };
    mocks.invoke.mockResolvedValue({ data: after, error: null });
    const { result, qc } = run(() => useSendTermsNotice());
    await result.mutateAsync();
    expect(mocks.invoke).toHaveBeenCalledWith("send-terms-notice", { body: { dryRun: false } });
    expect(qc.getQueryData(["admin", "terms-notice"])).toEqual(after);
  });
});
