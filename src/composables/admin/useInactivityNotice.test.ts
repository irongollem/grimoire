import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";
import { useSendInactivityNotice, useInactivityNoticeStatus, type InactivityNoticeStatus } from "./useInactivityNotice";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const STATUS: InactivityNoticeStatus = {
  configured: true,
  pending: 3,
  previouslyFailed: 0,
  sent: 0,
  failed: 0,
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

describe("useInactivityNotice", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("runs a dry run for the status", async () => {
    mocks.invoke.mockResolvedValue({ data: STATUS, error: null });
    const { result } = run(() => useInactivityNoticeStatus());
    await vi.waitFor(() => expect(result.data.value).toEqual(STATUS));
    expect(mocks.invoke).toHaveBeenCalledWith("send-inactivity-notice", { body: { dryRun: true } });
  });

  it("surfaces an invoke error", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("nope") });
    const { result } = run(() => useInactivityNoticeStatus());
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
  });

  it("sends for real and replaces the status with the response", async () => {
    const after = { ...STATUS, pending: 0, sent: 3 };
    mocks.invoke.mockResolvedValue({ data: after, error: null });
    const { result, qc } = run(() => useSendInactivityNotice());
    await result.mutateAsync();
    expect(mocks.invoke).toHaveBeenCalledWith("send-inactivity-notice", { body: { dryRun: false } });
    expect(qc.getQueryData(["admin", "inactivity-notice"])).toEqual(after);
  });

  it("a real send refreshes the audit log and the user list it just changed", async () => {
    mocks.invoke.mockResolvedValue({ data: STATUS, error: null });
    const { result, qc } = run(() => useSendInactivityNotice());
    const keys = [["admin", "audit-log"], ["admin", "users"]];
    for (const key of keys) qc.setQueryData(key, []);
    await result.mutateAsync();
    expect(keys.map((key) => qc.getQueryState(key)?.isInvalidated)).toEqual([true, true]);
  });
});
